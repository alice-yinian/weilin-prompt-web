#!/usr/bin/env python3
"""WeiLin-Comfyui-Tools 数据导入工具（Python 3.12 标准库，零第三方依赖）。

把原插件的 SQLite 数据（tag_groups/tag_subgroups/tag_tags/history/collect_history/
danbooru_tag + tag_labels.json + 预览图）转换成「浏览器可导入的 JSON 数据包（bundle）」。

- 只读打开源库：`file:<path>?mode=ro`，绝不修改用户原库
- 兼容旧版单文件库（无 uuid 列）、tags v2（uuid 可能为 NULL/空/重复）、v3、v4
- 输出 bundle（可选把预览图一起打进 zip）

用法示例见 --help。
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import secrets
import sqlite3
import sys
import time
import uuid
import zipfile
from datetime import datetime
from pathlib import Path

FORMAT = 'weilin-prompt-bundle'
FORMAT_VERSION = 1
GENERATOR = 'import_weilin_db.py/1.0.0'
DEFAULT_COLOR = 'rgba(255, 123, 2, .4)'
UNGROUPED_NAME = '未分组'
DB_FILE_RE = re.compile(r'^.*?userdatas_(?P<lang>.+?)(?:_(?P<role>tags|history|danbooru))?\.db$')
ROLE_SUFFIX = {'tags': '_tags.db', 'history': '_history.db', 'danbooru': '_danbooru.db'}
IMAGE_DIRS = ('tag_images', 'tag_thumbs')


class ToolError(Exception):
    """可直接展示给用户的错误。"""


# ---------------------------------------------------------------- uuid7

_uuid7_state = {'ms': 0, 'seq': 0}


def uuid7() -> str:
    """标准库实现的 UUIDv7：48bit 毫秒时间戳 + 版本/变体位 + 74bit 随机位。

    同一毫秒内用 12bit 序列自增，保证本次运行内单调且不重复。
    """
    ms = int(time.time() * 1000)
    if ms > _uuid7_state['ms']:
        _uuid7_state['ms'] = ms
        _uuid7_state['seq'] = secrets.randbits(12)
    else:
        ms = _uuid7_state['ms']
        _uuid7_state['seq'] += 1
        if _uuid7_state['seq'] > 0xFFF:
            _uuid7_state['ms'] += 1
            ms = _uuid7_state['ms']
            _uuid7_state['seq'] = 0
    value = (ms << 80) | (0x7 << 76) | (_uuid7_state['seq'] << 64) | (0b10 << 62) | secrets.randbits(62)
    return str(uuid.UUID(int=value))


# ---------------------------------------------------------------- sqlite 只读访问


def open_ro(path: Path) -> sqlite3.Connection:
    if not path.exists():
        raise ToolError(f'文件不存在：{path}')
    if not path.is_file():
        raise ToolError(f'不是文件：{path}')
    if path.stat().st_size == 0:
        raise ToolError(f'文件为空（0 字节），不是有效的 SQLite 数据库：{path}')
    uri = path.resolve().as_uri() + '?mode=ro'
    try:
        conn = sqlite3.connect(uri, uri=True)
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA query_only = 1')
        conn.execute('SELECT count(*) FROM sqlite_master').fetchone()
    except sqlite3.DatabaseError as exc:
        raise ToolError(f'不是合法的 SQLite 数据库：{path}（{exc}）') from exc
    return conn


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
    return row is not None


def columns_of(conn: sqlite3.Connection, table: str) -> list[str]:
    return [r['name'] for r in conn.execute(f'PRAGMA table_info({table})')]


def read_schema_version(conn: sqlite3.Connection) -> int | None:
    if not table_exists(conn, 'schema_version'):
        return None
    row = conn.execute('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').fetchone()
    return row[0] if row else None


def fetch_rows(conn: sqlite3.Connection, table: str, wanted: list[str]) -> list[dict]:
    """按需选列读取，缺失列不出现（由调用方补默认值）。"""
    cols = columns_of(conn, table)
    present = [c for c in wanted if c in cols]
    if not present:
        return []
    sql = f"SELECT {', '.join(present)} FROM {table} ORDER BY id_index" if 'id_index' in cols else \
          f"SELECT {', '.join(present)} FROM {table}"
    return [dict(r) for r in conn.execute(sql)]


def as_int(value) -> int | None:
    if value is None or value == '':
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def as_text(value) -> str:
    return '' if value is None else str(value)


# ---------------------------------------------------------------- 库发现


def classify_db_name(name: str) -> tuple[str, str | None] | None:
    """userdatas_zh_CN_tags.db -> ('zh_CN', 'tags')；userdatas_zh_CN.db -> ('zh_CN', None)。"""
    m = DB_FILE_RE.match(name)
    if not m:
        return None
    return m.group('lang'), m.group('role')


def find_user_data_dir(plugin_root: Path) -> Path:
    if not plugin_root.exists():
        raise ToolError(f'插件根目录不存在：{plugin_root}')
    candidate = plugin_root / 'user_data'
    if candidate.is_dir():
        return candidate
    return plugin_root


def discover_databases(plugin_root: Path) -> tuple[dict[str, Path], dict, Path]:
    """扫描 user_data/userdatas_*.db。

    返回 (roles, meta, user_data_dir)：roles 为 {'tags'|'history'|'danbooru': Path}，
    meta 含 {'lang': ...}。优先「带 lang 后缀的三件套」，其次任意拆分库，最后旧版单文件库。
    """
    user_dir = find_user_data_dir(plugin_root)
    entries: list[tuple[str, str | None, Path]] = []
    for file in sorted(user_dir.glob('userdatas_*.db')):
        parsed = classify_db_name(file.name)
        if parsed:
            entries.append((parsed[0], parsed[1], file))
        else:
            entries.append((file.stem, None, file))
    if not entries:
        return {}, {}, user_dir

    langs = sorted({lang for lang, _, _ in entries})
    # 排序优先级：有拆分 tags 库（新版布局） > 非 default > 字典序
    def lang_rank(lang: str) -> tuple:
        has_split = any(l == lang and role == 'tags' for l, role, _ in entries)
        return (0 if has_split else 1, 1 if lang == 'default' else 0, lang)

    lang = sorted(langs, key=lang_rank)[0]
    roles: dict[str, Path] = {}
    for found_lang, role, file in entries:
        if found_lang != lang:
            continue
        if role in ROLE_SUFFIX and role not in roles:
            roles[role] = file
    if 'tags' not in roles:
        # 回退旧版单文件库：同一个文件同时充当 tags / history / danbooru
        legacy = [f for l, role, f in entries if l == lang and role is None]
        if legacy:
            for role in ROLE_SUFFIX:
                roles.setdefault(role, legacy[0])
    meta = {'lang': lang, 'ignored_langs': [l for l in langs if l != lang]}
    return roles, meta, user_dir


# ---------------------------------------------------------------- 规范化


def new_stats() -> dict:
    return {
        'uuid_generated': 0,
        'uuid_reassigned': 0,
        'orphans_dropped': 0,
        'orphans_kept': 0,
        'deleted_skipped': 0,
        'plain_text_history': 0,
    }


def fill_missing_uuids(rows: list[dict], key: str, stats: dict) -> None:
    for row in rows:
        value = row.get(key)
        if value is None or not str(value).strip():
            row[key] = uuid7()
            stats['uuid_generated'] += 1


def warn_malformed_uuids(rows: list[dict], key: str, label: str, warnings: list[str]) -> None:
    """源库里可能存了非 UUID 字符串（老版本手工塞的 key）。仍可当主键用，原样保留并提示。"""
    bad = sum(1 for row in rows if not is_uuid_like(str(row[key])))
    if bad:
        warnings.append(f'{label}表有 {bad} 个 uuid 不是标准 UUID 格式，已原样保留（不影响导入）')


def dedup_uuids(rows: list[dict], key: str, label: str, warnings: list[str], stats: dict) -> None:
    """重复 uuid：保留 (create_time, id_index) 最小者，其余改新 uuid。

    create_time 为空视为最大（排最后），与「保留最早创建的」语义一致。
    """
    buckets: dict[str, list[dict]] = {}
    for row in rows:
        buckets.setdefault(row[key], []).append(row)
    for dup_uuid, group in buckets.items():
        if len(group) <= 1:
            continue
        group.sort(key=lambda r: (r['create_time'] is None, r['create_time'] or 0, r['src_id'] or 0))
        for row in group[1:]:
            fresh = uuid7()
            warnings.append(f'{label} id_index={row["src_id"]} 的 uuid 重复（{dup_uuid}），已改为 {fresh}')
            row[key] = fresh
            stats['uuid_reassigned'] += 1


def index_children(rows: list[dict], key: str) -> tuple[dict, dict]:
    """建 (uuid -> row) 与 (src_id -> row) 两张表，供子级解析父引用。"""
    by_uuid = {row[key]: row for row in rows}
    by_src = {row['src_id']: row for row in rows if row['src_id'] is not None}
    return by_uuid, by_src


def find_dup_uuids(rows: list[dict], key: str) -> set[str]:
    seen: dict[str, int] = {}
    for row in rows:
        seen[row[key]] = seen.get(row[key], 0) + 1
    return {u for u, n in seen.items() if n > 1}


def resolve_parent(ref, src_parent_id, key, parents: tuple[dict, dict], dup_uuids: set[str]):
    """把子行的父引用解析成父行最终 uuid；解析不到返回 None（孤儿）。

    - uuid 是权威关联（计划 §4.1）
    - 若该 uuid 重复过，则优先用 group_id / subgroup_id 重定向到被改 uuid 的那一行，
      从而「重建其子级引用」
    """
    by_uuid, by_src = parents
    ref = as_text(ref).strip()
    if ref in dup_uuids and src_parent_id in by_src:
        return by_src[src_parent_id][key]
    if ref and ref in by_uuid:
        return ref
    if src_parent_id in by_src:
        return by_src[src_parent_id][key]
    return None


def normalize_tags_db(conn: sqlite3.Connection, keep_orphans: bool, warnings: list[str], stats: dict) -> dict:
    tables = {t for t in ('tag_groups', 'tag_subgroups', 'tag_tags') if table_exists(conn, t)}
    if not tables:
        raise ToolError('tags 库中找不到 tag_groups / tag_subgroups / tag_tags 表')

    groups: list[dict] = []
    if 'tag_groups' in tables:
        for raw in fetch_rows(conn, 'tag_groups', ['id_index', 'name', 'color', 'create_time', 'p_uuid']):
            groups.append({
                'p_uuid': raw.get('p_uuid'),
                'name': as_text(raw.get('name')),
                'color': as_text(raw.get('color')) or DEFAULT_COLOR,
                'create_time': as_int(raw.get('create_time')),
                'src_id': as_int(raw.get('id_index')),
            })

    subgroups: list[dict] = []
    if 'tag_subgroups' in tables:
        cols = ['id_index', 'group_id', 'name', 'color', 'create_time', 'p_uuid', 'g_uuid']
        for raw in fetch_rows(conn, 'tag_subgroups', cols):
            subgroups.append({
                'g_uuid': raw.get('g_uuid'),
                'p_uuid': raw.get('p_uuid'),
                'name': as_text(raw.get('name')),
                'color': as_text(raw.get('color')) or DEFAULT_COLOR,
                'create_time': as_int(raw.get('create_time')),
                'src_id': as_int(raw.get('id_index')),
                '_group_id': as_int(raw.get('group_id')),
            })

    tags: list[dict] = []
    if 'tag_tags' in tables:
        cols = ['id_index', 'subgroup_id', 'text', 'desc', 'color', 'create_time',
                't_uuid', 'g_uuid', 'image_path', 'image_status']
        for raw in fetch_rows(conn, 'tag_tags', cols):
            tags.append({
                't_uuid': raw.get('t_uuid'),
                'g_uuid': raw.get('g_uuid'),
                'text': as_text(raw.get('text')),
                'desc': as_text(raw.get('desc')),
                'color': as_text(raw.get('color')) or DEFAULT_COLOR,
                'create_time': as_int(raw.get('create_time')),
                'image_path': raw.get('image_path') or None,
                'image_status': raw.get('image_status') or None,
                'src_id': as_int(raw.get('id_index')),
                '_subgroup_id': as_int(raw.get('subgroup_id')),
            })

    # 1) 一级分组
    fill_missing_uuids(groups, 'p_uuid', stats)
    warn_malformed_uuids(groups, 'p_uuid', '分组', warnings)
    group_dup = find_dup_uuids(groups, 'p_uuid')  # 必须在去重前统计，否则查不到重复
    dedup_uuids(groups, 'p_uuid', '分组', warnings, stats)
    group_parents = index_children(groups, 'p_uuid')

    # 2) 二级分组：先补自身 uuid/去重，再解析父引用
    fill_missing_uuids(subgroups, 'g_uuid', stats)
    warn_malformed_uuids(subgroups, 'g_uuid', '二级分组', warnings)
    subgroup_dup = find_dup_uuids(subgroups, 'g_uuid')  # 必须在去重前统计
    dedup_uuids(subgroups, 'g_uuid', '二级分组', warnings, stats)
    for row in subgroups:
        row['p_uuid'] = resolve_parent(row['p_uuid'], row['_group_id'], 'p_uuid', group_parents, group_dup)

    ungrouped = {'row': None}

    def ensure_ungrouped_group() -> dict:
        if ungrouped['row'] is None:
            row = {
                'p_uuid': uuid7(),
                'name': UNGROUPED_NAME,
                'color': DEFAULT_COLOR,
                'create_time': int(time.time()),
                'src_id': None,
            }
            groups.append(row)
            group_parents[0][row['p_uuid']] = row
            ungrouped['row'] = row
        return ungrouped['row']

    kept_subgroups = []
    for row in subgroups:
        if row['p_uuid'] is None:
            if keep_orphans:
                row['p_uuid'] = ensure_ungrouped_group()['p_uuid']
                kept_subgroups.append(row)
                stats['orphans_kept'] += 1
            else:
                warnings.append(f'二级分组 id_index={row["src_id"]} 父分组不存在，已跳过')
                stats['orphans_dropped'] += 1
        else:
            kept_subgroups.append(row)
    subgroups = kept_subgroups

    subgroup_parents = index_children(subgroups, 'g_uuid')

    def ensure_ungrouped_subgroup() -> dict:
        parent = ensure_ungrouped_group()
        for row in subgroups:
            if row['p_uuid'] == parent['p_uuid'] and row['name'] == UNGROUPED_NAME:
                return row
        row = {
            'g_uuid': uuid7(),
            'p_uuid': parent['p_uuid'],
            'name': UNGROUPED_NAME,
            'color': DEFAULT_COLOR,
            'create_time': int(time.time()),
            'src_id': None,
        }
        subgroups.append(row)
        subgroup_parents[0][row['g_uuid']] = row
        return row

    # 3) tag：先补自身 uuid/去重，再解析父引用
    fill_missing_uuids(tags, 't_uuid', stats)
    warn_malformed_uuids(tags, 't_uuid', 'tag', warnings)
    dedup_uuids(tags, 't_uuid', 'tag', warnings, stats)
    kept_tags = []
    for row in tags:
        row['g_uuid'] = resolve_parent(row['g_uuid'], row['_subgroup_id'], 'g_uuid', subgroup_parents, subgroup_dup)
        if row['g_uuid'] is None:
            if keep_orphans:
                row['g_uuid'] = ensure_ungrouped_subgroup()['g_uuid']
                kept_tags.append(row)
                stats['orphans_kept'] += 1
            else:
                warnings.append(f'tag id_index={row["src_id"]} 父二级分组不存在，已跳过')
                stats['orphans_dropped'] += 1
        else:
            kept_tags.append(row)
    tags = kept_tags

    groups.sort(key=lambda r: (r['create_time'] is None, r['create_time'] or 0, r['src_id'] or 0))
    subgroups.sort(key=lambda r: (r['create_time'] is None, r['create_time'] or 0, r['src_id'] or 0))
    tags.sort(key=lambda r: (r['create_time'] is None, -(r['create_time'] or 0), r['src_id'] or 0))

    return {
        'groups': [{'p_uuid': r['p_uuid'], 'name': r['name'], 'color': r['color'],
                    'create_time': r['create_time'], 'src_id': r['src_id']} for r in groups],
        'subgroups': [{'g_uuid': r['g_uuid'], 'p_uuid': r['p_uuid'], 'name': r['name'], 'color': r['color'],
                       'create_time': r['create_time'], 'src_id': r['src_id']} for r in subgroups],
        'tags': [{'t_uuid': r['t_uuid'], 'g_uuid': r['g_uuid'], 'text': r['text'], 'desc': r['desc'],
                  'color': r['color'], 'create_time': r['create_time'], 'image_path': r['image_path'],
                  'image_status': r['image_status'], 'src_id': r['src_id']} for r in tags],
    }


def read_history_table(conn: sqlite3.Connection, table: str, label: str,
                       warnings: list[str], stats: dict) -> list[dict]:
    if not table_exists(conn, table):
        return []
    out = []
    for raw in fetch_rows(conn, table, ['id_index', 'tag', 'name', 'color', 'create_time', 'is_deleted']):
        src_id = as_int(raw.get('id_index'))
        if as_int(raw.get('is_deleted')) == 1:
            stats['deleted_skipped'] += 1
            continue
        text = as_text(raw.get('tag'))
        try:
            json.loads(text)
        except (json.JSONDecodeError, TypeError):
            warnings.append(f'{label} id_index={src_id} 的 tag 字段不是合法 JSON，已按纯文本保留')
            stats['plain_text_history'] += 1
        out.append({
            'tag': text,
            'name': as_text(raw.get('name')),
            'color': as_text(raw.get('color')),
            'create_time': as_int(raw.get('create_time')),
            'src_id': src_id,
        })
    return out


def read_dict_table(conn: sqlite3.Connection, warnings: list[str]) -> list[dict]:
    if not table_exists(conn, 'danbooru_tag'):
        warnings.append('词典库中没有 danbooru_tag 表，dict 为空')
        return []
    cols = columns_of(conn, 'danbooru_tag')
    missing = [c for c in ('hot', 'aliases') if c not in cols]
    if missing:
        warnings.append(f'danbooru_tag 缺列 {"/".join(missing)}，已按默认值 0 补齐')
    out = []
    for raw in fetch_rows(conn, 'danbooru_tag', ['id_index', 'tag', 'color_id', 'translate', 'hot', 'aliases']):
        out.append({
            'tag': as_text(raw.get('tag')),
            'color_id': as_int(raw.get('color_id')) or 0,
            'translate': as_text(raw.get('translate')),
            'hot': as_int(raw.get('hot')) or 0,
            'aliases': as_int(raw.get('aliases')) or 0,
        })
    return out


def default_label_settings() -> dict:
    return {'sortMode': 'manual', 'sortTimeDesc': True, 'sortNameAsc': True, 'selectedId': None}


_UUID_RE = re.compile(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')


def is_uuid_like(value: str) -> bool:
    return bool(_UUID_RE.match(value))


def load_labels(path: Path | None, warnings: list[str]) -> dict:
    empty = {'items': [], 'settings': default_label_settings()}
    if path is None:
        return empty
    if not path.exists():
        warnings.append(f'主标签文件不存在，已跳过：{path}')
        return empty
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        warnings.append(f'主标签文件解析失败，已跳过：{path}（{exc}）')
        return empty
    items_raw = raw if isinstance(raw, list) else (raw.get('items') or [] if isinstance(raw, dict) else [])
    settings_raw = {} if isinstance(raw, list) else (raw.get('settings') or {} if isinstance(raw, dict) else {})
    now = int(time.time() * 1000)
    items = []
    for idx, item in enumerate(items_raw):
        if not isinstance(item, dict):
            continue
        items.append({
            'id': as_text(item.get('id')) or uuid7(),
            'name': as_text(item.get('name')) or '未命名',
            'content': as_text(item.get('content')),
            'createdAt': as_int(item.get('createdAt')) or as_int(item.get('updatedAt')) or now,
            'updatedAt': as_int(item.get('updatedAt')) or as_int(item.get('createdAt')) or now,
            'pinned': bool(item.get('pinned')),
            'highlighted': bool(item.get('highlighted')),
            'order': as_int(item.get('order')) if as_int(item.get('order')) is not None else idx,
        })
    settings = default_label_settings()
    settings.update({
        'sortMode': settings_raw.get('sortMode') or settings['sortMode'],
        'sortTimeDesc': bool(settings_raw.get('sortTimeDesc', settings['sortTimeDesc'])),
        'sortNameAsc': bool(settings_raw.get('sortNameAsc', settings['sortNameAsc'])),
        'selectedId': settings_raw.get('selectedId') if isinstance(settings_raw.get('selectedId'), str) else None,
    })
    return {'items': items, 'settings': settings}


# ---------------------------------------------------------------- 图片


def collect_images(user_dir: Path, tag_uuids: set[str]) -> list[tuple[Path, str]]:
    """按 t_uuid 收集 tag_images / tag_thumbs 下的文件，返回 [(磁盘路径, zip 内相对路径)]。"""
    found: list[tuple[Path, str]] = []
    for dirname in IMAGE_DIRS:
        directory = user_dir / dirname
        if not directory.is_dir():
            continue
        for file in sorted(directory.iterdir()):
            if not file.is_file():
                continue
            if file.stem not in tag_uuids:
                continue
            found.append((file, f'images/{dirname}/{file.name}'))
    return found


# ---------------------------------------------------------------- bundle / 报告


def canonical(items) -> str:
    return json.dumps(items, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def sha256_bytes(data: bytes) -> str:
    return 'sha256:' + hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b''):
            digest.update(chunk)
    return 'sha256:' + digest.hexdigest()


def build_bundle(data: dict, counts: dict, source_files: list[dict], lang: str, has_images: bool,
                 warnings: list[str]) -> dict:
    checksum = {}
    for section in ('groups', 'subgroups', 'tags', 'history', 'favorites', 'dict', 'labels'):
        payload = data.get(section)
        if payload is None:
            continue
        checksum[section] = sha256_bytes(canonical(payload).encode('utf-8'))
    return {
        'format': FORMAT,
        'formatVersion': FORMAT_VERSION,
        'generatedAt': int(time.time() * 1000),
        'generator': GENERATOR,
        'source': {
            'lang': lang,
            'dbFiles': source_files,
            'hasImages': has_images,
        },
        'counts': counts,
        'data': data,
        'warnings': warnings,
        'checksum': checksum,
    }


def render_report(bundle: dict, stats: dict, user_dir: Path, out_path: Path, zip_path: Path | None) -> str:
    generated = datetime.fromtimestamp(bundle['generatedAt'] / 1000).strftime('%Y-%m-%d %H:%M:%S')
    lines = [
        'WeiLin 数据导入报告',
        f'生成时间：{generated}',
        f'生成器：{GENERATOR}',
        f'输出 bundle：{out_path}',
    ]
    if zip_path:
        lines.append(f'输出图片包：{zip_path}')
    lines += [
        '',
        '数据源（user_data 目录：%s，语言：%s）' % (user_dir, bundle['source']['lang'] or '未知'),
    ]
    for entry in bundle['source']['dbFiles']:
        schema = entry['schemaVersion'] if entry['schemaVersion'] is not None else '无'
        lines.append(f"  - [{entry['role']}] {entry['file']}  schema_version={schema}  "
                     f"{entry['size']} 字节  {entry['sha256']}")
    if not bundle['source']['dbFiles']:
        lines.append('  （无）')

    counts = bundle['counts']
    lines += [
        '',
        '条数',
        f"  groups     {counts['groups']}",
        f"  subgroups  {counts['subgroups']}",
        f"  tags       {counts['tags']}",
        f"  history    {counts['history']}",
        f"  favorites  {counts['favorites']}",
        f"  dict       {counts['dict']}",
        f"  labels     {counts['labels']}",
        f"  images     {counts['images']}",
        '',
        '规范化统计',
        f"  生成 uuid            {stats['uuid_generated']}",
        f"  重复 uuid 改新值      {stats['uuid_reassigned']}",
        f"  孤儿行丢弃            {stats['orphans_dropped']}",
        f"  孤儿行归入未分组      {stats['orphans_kept']}",
        f"  跳过 is_deleted=1     {stats['deleted_skipped']}",
        f"  非 JSON 历史文本      {stats['plain_text_history']}",
        '',
        f'warnings（{len(bundle["warnings"])}）',
    ]
    lines += [f'  - {w}' for w in bundle['warnings']] or ['  （无）']
    lines.append('')
    return '\n'.join(lines)


# ---------------------------------------------------------------- 主流程


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog='import_weilin_db.py',
        description='把 WeiLin-Comfyui-Tools 的 SQLite 数据转换成浏览器可导入的 JSON 数据包（bundle）。',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            '示例：\n'
            '  python3 tools/import_weilin_db.py --plugin-root "/path/to/WeiLin-Comfyui-Tools" \\\n'
            '      --out weilin-data-zh_CN-20261007.json\n'
            '  python3 tools/import_weilin_db.py --tags-db userdatas_zh_CN_tags.db \\\n'
            '      --history-db userdatas_zh_CN_history.db --dict-db userdatas_zh_CN_danbooru.db \\\n'
            '      --labels tag_labels.json --include-images --report import-report.txt\n'
            '  python3 tools/import_weilin_db.py --tags-db userdatas_zh_CN.db --out old.json   # 旧版单文件库\n'
        ),
    )
    parser.add_argument('--plugin-root', help='插件根目录，自动发现 user_data/ 下的 userdatas_*.db')
    parser.add_argument('--tags-db', help='tag_groups/tag_subgroups/tag_tags 所在的库（也接受旧版单文件库）')
    parser.add_argument('--history-db', help='history/collect_history 所在的库（默认同 --tags-db）')
    parser.add_argument('--dict-db', help='danbooru_tag 所在的库')
    parser.add_argument('--labels', help='tag_labels.json 路径')
    parser.add_argument('--out', help='bundle 输出路径（默认 weilin-data-<lang>-<YYYYMMDD>.json）')
    parser.add_argument('--report', help='人读报告输出路径（默认只打印到 stdout）')
    parser.add_argument('--include-dict', dest='include_dict', action='store_true', default=True,
                        help='导出 danbooru 词典（默认开启）')
    parser.add_argument('--no-dict', dest='include_dict', action='store_false', help='不导出 danbooru 词典')
    parser.add_argument('--include-images', action='store_true',
                        help='把 tag_images / tag_thumbs 按 t_uuid 打包进 zip（data.json + images/）')
    parser.add_argument('--images-out', help='图片包输出路径（隐含 --include-images）；'
                                              '以 / 结尾或指向目录时，在其中生成 <bundle 名>.zip')
    parser.add_argument('--keep-orphans', action='store_true', help='孤儿行归入自动创建的「未分组」而非丢弃')
    parser.add_argument('--pretty', action='store_true', help='JSON 缩进输出（体积更大，便于人工查看）')
    parser.add_argument('--version', action='version', version=GENERATOR)
    return parser.parse_args(argv)


def resolve_out_path(args: argparse.Namespace, lang: str) -> Path:
    if args.out:
        return Path(args.out)
    stamp = datetime.now().strftime('%Y%m%d')
    return Path.cwd() / f'weilin-data-{lang or "default"}-{stamp}.json'


def resolve_zip_path(args: argparse.Namespace, out_path: Path) -> Path:
    if not args.images_out:
        return out_path.with_suffix('.zip') if out_path.suffix == '.json' else Path(str(out_path) + '.zip')
    raw = Path(args.images_out)
    as_dir = str(args.images_out).endswith(('/', '\\')) or raw.is_dir()
    if as_dir:
        raw.mkdir(parents=True, exist_ok=True)
        return raw / (out_path.stem + '.zip')
    raw.parent.mkdir(parents=True, exist_ok=True)
    return raw


def write_zip(zip_path: Path, data_json: bytes, images: list[tuple[Path, str]]) -> None:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        zf.writestr('data.json', data_json)
        for src, arcname in images:
            zf.write(src, arcname)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.images_out and not args.include_images:
        args.include_images = True  # 给了图片输出路径就视为要打图片
    warnings: list[str] = []
    stats = new_stats()

    try:
        roles: dict[str, Path] = {}
        lang = ''
        user_dir: Path | None = None
        if args.plugin_root:
            root = Path(args.plugin_root).expanduser()
            discovered, meta, user_dir = discover_databases(root)
            roles.update(discovered)
            lang = meta.get('lang', '')
            ignored = meta.get('ignored_langs') or []
            if ignored:
                warnings.append(
                    f'user_data 下发现多套语言数据（{lang}、{"/".join(ignored)}），'
                    f'已选用 {lang}；如需其它语言请用 --tags-db 等显式指定'
                )
            if not discovered:
                raise ToolError(
                    f'在 {user_dir} 下未找到任何 userdatas_*.db 文件。\n'
                    f'提示：可用 --tags-db / --history-db / --dict-db 直接指定文件。'
                )
        for role, value in (('tags', args.tags_db), ('history', args.history_db), ('danbooru', args.dict_db)):
            if value:
                roles[role] = Path(value).expanduser()
        roles = {role: path for role, path in roles.items() if role in ROLE_SUFFIX}
        if not roles:
            raise ToolError('未指定任何数据源。请用 --plugin-root 或 --tags-db 等参数指定。')
        if 'tags' in roles:
            # 未显式指定的角色回退到 tags 库：旧版单文件库里三张表都在同一个文件
            for role in ('history', 'danbooru'):
                roles.setdefault(role, roles['tags'])

        first_path = roles.get('tags') or next(iter(roles.values()))
        if user_dir is None:
            user_dir = first_path.expanduser().resolve().parent
        if not lang:
            parsed = classify_db_name(first_path.name)
            lang = parsed[0] if parsed else ''

        conns: dict[str, sqlite3.Connection] = {}
        source_files: list[dict] = []
        for role in ('tags', 'history', 'danbooru'):
            if role not in roles:
                warnings.append(f'未提供 {role} 数据源，相关数据留空')
                continue
            path = roles[role].expanduser()
            conn = open_ro(path)
            conns[role] = conn
            source_files.append({
                'role': role,
                'file': path.name,
                'schemaVersion': read_schema_version(conn),
                'size': path.stat().st_size,
                'sha256': file_sha256(path),
            })

        data: dict = {'groups': [], 'subgroups': [], 'tags': [], 'history': [], 'favorites': [], 'dict': []}
        if 'tags' in conns:
            data.update(normalize_tags_db(conns['tags'], args.keep_orphans, warnings, stats))
        if 'history' in conns:
            data['history'] = read_history_table(conns['history'], 'history', 'history', warnings, stats)
            data['favorites'] = read_history_table(
                conns['history'], 'collect_history', 'collect_history', warnings, stats)
        if args.include_dict and 'danbooru' in conns:
            data['dict'] = read_dict_table(conns['danbooru'], warnings)

        labels_path: Path | None = None
        if args.labels:
            labels_path = Path(args.labels).expanduser()
        elif args.plugin_root:
            candidate = Path(args.plugin_root).expanduser() / 'tag_labels.json'
            if candidate.exists():
                labels_path = candidate
        data['labels'] = load_labels(labels_path, warnings)

        has_data = any(data[s] for s in ('groups', 'subgroups', 'tags', 'history', 'favorites', 'dict'))
        has_data = has_data or bool(data['labels']['items'])
        if not has_data:
            raise ToolError(
                '数据源里没有任何可导入的数据（分组/tag/历史/词典/主标签均为空）。\n'
                '提示：确认 --tags-db 指向的是 tag_groups/tag_tags 所在的库。'
            )

        out_path = resolve_out_path(args, lang)
        tag_uuids = {t['t_uuid'] for t in data['tags']}
        images: list[tuple[Path, str]] = []
        if args.include_images:
            base = user_dir if user_dir is not None else first_path.expanduser().resolve().parent
            images = collect_images(Path(base), tag_uuids)
            if not images:
                if stats['uuid_generated'] or stats['uuid_reassigned']:
                    warnings.append(
                        '源库 uuid 缺失/重复，本次生成的 uuid 每次运行都不同，'
                        '按 t_uuid 命名的预览图无法匹配（预览图功能需要带 uuid 的 v4 库）'
                    )
                else:
                    warnings.append('未找到与已导出 tag 匹配的预览图（tag_images / tag_thumbs）')
            if not data['tags']:
                warnings.append('没有导出任何 tag，图片包中不含 images/')

        counts = {
            'groups': len(data['groups']),
            'subgroups': len(data['subgroups']),
            'tags': len(data['tags']),
            'history': len(data['history']),
            'favorites': len(data['favorites']),
            'dict': len(data['dict']),
            'labels': len(data['labels']['items']),
            'images': len(images),
        }
        bundle = build_bundle(data, counts, source_files, lang, bool(images), warnings)

        indent = 2 if args.pretty else None
        separators = None if args.pretty else (',', ':')
        payload = json.dumps(bundle, ensure_ascii=False, indent=indent, separators=separators) + '\n'
        raw = payload.encode('utf-8')

        zip_path = None
        if args.include_images:
            zip_path = resolve_zip_path(args, out_path)
            write_zip(zip_path, raw, images)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_bytes(raw)

        report = render_report(bundle, stats, Path(user_dir) if user_dir else Path('.'), out_path, zip_path)
        if args.report:
            report_path = Path(args.report).expanduser()
            report_path.parent.mkdir(parents=True, exist_ok=True)
            report_path.write_text(report, encoding='utf-8')
        sys.stdout.write(report)
        sys.stdout.write(f'\nbundle 已写出：{out_path}（{len(raw)} 字节）\n')
        if zip_path:
            sys.stdout.write(f'图片包已写出：{zip_path}（{counts["images"]} 张）\n')
        for conn in conns.values():
            conn.close()
        return 0
    except ToolError as exc:
        sys.stderr.write(f'错误：{exc}\n')
        return 2
    except KeyboardInterrupt:
        sys.stderr.write('已取消。\n')
        return 130


if __name__ == '__main__':
    raise SystemExit(main())
