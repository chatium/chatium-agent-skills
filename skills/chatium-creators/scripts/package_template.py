#!/usr/bin/env python3
"""Package explicit, reviewed paths; never sweep a complete checkout implicitly."""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile

BLOCKED = {'.git', '.env', 'node_modules', '.typings', '__pycache__', '.DS_Store', '.npmrc', '.netrc', 'id_rsa', 'id_ed25519'}


def collect(root, includes, output):
    root = root.resolve(strict=True)
    paths = {}
    for name in includes:
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or str(relative) == '.':
            raise ValueError('Select explicit relative files/directories inside --root')
        source = root / relative
        if not source.exists():
            raise ValueError(f'Missing input: {name}')
        candidates = [source, *source.rglob('*')] if source.is_dir() else [source]
        for path in candidates:
            rel = path.relative_to(root)
            if any(part in BLOCKED or part.startswith('.env.') for part in rel.parts) or path.suffix.lower() in {'.pem', '.key', '.p12', '.pfx'}:
                raise ValueError(f'Remove private/generated input from the prepared package: {rel}')
            if path.is_symlink() or any(parent.is_symlink() for parent in path.parents if parent != root and root in parent.parents):
                raise ValueError(f'Symlinks are not supported: {rel}')
            if not path.resolve().is_relative_to(root):
                raise ValueError(f'Input escapes root: {rel}')
            if path.resolve() == output.resolve():
                raise ValueError('Output must not be among selected inputs')
            if path.is_file():
                paths[rel.as_posix()] = path
    if not paths:
        raise ValueError('The package is empty')
    return paths


def package(root, includes, output):
    paths = collect(root, includes, output)
    if output.exists() or output.is_symlink():
        raise ValueError('Output already exists; choose a new path or explicitly remove the old artifact')
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(output, 'x', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, path in sorted(paths.items()):
                info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                with path.open('rb') as src, archive.open(info, 'w') as dst:
                    while chunk := src.read(1024 * 1024):
                        dst.write(chunk)
        with zipfile.ZipFile(output) as archive:
            if archive.testzip():
                raise ValueError('ZIP integrity check failed')
    except Exception:
        output.unlink(missing_ok=True)
        raise
    digest = hashlib.sha256()
    with output.open('rb') as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return {'file': str(output), 'files': sorted(paths), 'bytes': output.stat().st_size, 'sha256': digest.hexdigest()}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--include', nargs='+', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(package(args.root, args.include, args.output), ensure_ascii=False, indent=2))
    except (ValueError, OSError) as error:
        parser.exit(1, f'{error}\n')
