#!/usr/bin/env python3
"""Job ledger for a large batch of Scenario MCP jobs: one tab-separated line per job.

Usage:
  python3 scripts/ledger.py <ledger.tsv> add <kind> <model-name> name=job_id [name=job_id ...]
  python3 scripts/ledger.py <ledger.tsv> ids name=asset_id[,asset_id] [...]
  python3 scripts/ledger.py <ledger.tsv> fetch <out-dir> <search-result.json> [more.json ...]
  python3 scripts/ledger.py <ledger.tsv> status

Columns: name, kind, model, job, asset ids, local files. Write the line when the job is launched
(add), write the asset ids when jobs_wait returns (ids), then download (fetch). After a network
drop, status says what is launched, finished and on disk.

fetch reads saved results of the Scenario MCP `search` tool on assets, run with include_urls=true
and filters.model_id, one call per model, limit 100. A plain listing also returns prompt text
assets, so recent pages miss files. Assets are matched to rows by metadata.parentJobId, or by
the asset ids already in the ledger. The first part of a name before "_" is the sub-folder
(w_smg goes to w/). Files already on disk are skipped. Signed URLs stay in the saved JSON and
never pass through the conversation.
"""
import json
import os
import subprocess
import sys

EXT = {'model/gltf-binary': 'glb', 'model/x-blender': 'blend', 'image/png': 'png', 'image/jpeg': 'jpg',
       'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav',
       'application/zip': 'zip'}
HEAD = '# name\tkind\tmodel\tjob\tasset\tfile'


def load(path):
    if not os.path.exists(path):
        return [HEAD.split('\t')]
    with open(path, encoding='utf-8') as fh:
        return [line.rstrip('\n').split('\t') for line in fh if line.strip()]


def save(path, rows):
    with open(path, 'w', encoding='utf-8') as f:
        f.write('\n'.join('\t'.join(r) for r in rows) + '\n')


def main():
    if len(sys.argv) < 3 or sys.argv[2] not in ('add', 'ids', 'fetch', 'status'):
        sys.exit(__doc__)
    path, cmd, args = sys.argv[1], sys.argv[2], sys.argv[3:]
    rows = load(path)
    if cmd == 'add':
        kind, model = args[:2]
        known = {r[0] for r in rows}
        for a in args[2:]:
            name, job = a.split('=', 1)
            if name in known:
                sys.exit(f'{name} is already in the ledger: use a new name for a retake')
            rows.append([name, kind, model, job, '', ''])
        save(path, rows)
        print('added', len(args) - 2)
    elif cmd == 'ids':
        want = dict(a.split('=', 1) for a in args)
        n = 0
        for r in rows:
            if r[0] in want:
                while len(r) < 6:
                    r.append('')
                r[4] = want[r[0]]
                n += 1
        save(path, rows)
        print('set', n, 'of', len(want))
    elif cmd == 'fetch':
        out = args[0]
        by_job, by_id = {}, {}
        for f in args[1:]:
            with open(f, encoding='utf-8') as fh:
                found = json.load(fh)['assets']
            for a in found:
                by_id[a['id']] = a
                job = (a.get('metadata') or {}).get('parentJobId')
                if job:
                    by_job.setdefault(job, []).append(a)
        n = 0
        for r in rows:
            if r[0].startswith('#') or len(r) < 4:
                continue
            while len(r) < 6:
                r.append('')
            name, job = r[0], r[3]
            if r[5] and all(os.path.exists(os.path.join(out, p)) for p in r[5].split(',')):
                continue
            found = by_job.get(job) or [by_id[i] for i in r[4].split(',') if i in by_id]
            found = [a for a in found if a.get('url')]
            if not found:
                continue
            fold = name.split('_')[0]
            os.makedirs(os.path.join(out, fold), exist_ok=True)
            files = []
            for i, a in enumerate(sorted(found, key=lambda a: a['id'])):
                ext = EXT.get(a.get('mimeType', ''), 'bin')
                rel = f"{fold}/{name}{'' if i == 0 else '_' + str(i)}.{ext}"
                subprocess.run(['curl', '-fsSL', '-o', os.path.join(out, rel), a['url']], check=True)
                files.append((a['id'], rel))
                n += 1
            r[4] = ','.join(f[0] for f in files)
            r[5] = ','.join(f[1] for f in files)
        save(path, rows)
        print('downloaded', n)
    else:
        jobs = [r for r in rows if not r[0].startswith('#') and len(r) >= 4]
        done = [r for r in jobs if len(r) > 4 and r[4]]
        disk = [r for r in jobs if len(r) > 5 and r[5]]
        print(f'{len(jobs)} jobs, {len(done)} with asset ids, {len(disk)} on disk')
        for r in jobs:
            if not (len(r) > 5 and r[5]):
                print('  open:', r[0], r[1], r[3], '(finished, not fetched)' if len(r) > 4 and r[4] else '(no asset id yet)')


if __name__ == '__main__':
    main()
