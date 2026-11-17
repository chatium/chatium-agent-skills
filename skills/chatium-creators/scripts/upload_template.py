#!/usr/bin/env python3
"""Stream a ZIP to a short-lived creator SDK upload URL. Never print the URL."""
import argparse
import http.client
import json
from pathlib import Path
import re
import secrets
from urllib.parse import urlsplit
import zipfile


def upload(file, settings):
    url = urlsplit(settings['uploadUrl'])
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment:
        raise ValueError('Expected the HTTPS uploadUrl returned by createCreatorTemplateUpload')
    if settings.get('fieldName') != 'Filedata':
        raise ValueError('Unsupported upload field; refresh the SDK upload instructions')
    if file.suffix.lower() != '.zip' or not zipfile.is_zipfile(file):
        raise ValueError('Expected a valid ZIP file')
    if not re.fullmatch(r'[A-Za-z0-9._-]+\.zip', file.name, flags=re.I):
        raise ValueError('Use a simple ZIP filename with letters, digits, dots, hyphens or underscores')
    boundary = 'creator-' + secrets.token_hex(16)
    before = (f'--{boundary}\r\nContent-Disposition: form-data; name="Filedata"; filename="{file.name}"\r\nContent-Type: application/zip\r\n\r\n').encode()
    after = f'\r\n--{boundary}--\r\n'.encode()
    conn = http.client.HTTPSConnection(url.hostname, url.port, timeout=120)
    try:
        conn.putrequest('POST', url.path + ('?' + url.query if url.query else ''))
        conn.putheader('Content-Type', f'multipart/form-data; boundary={boundary}')
        conn.putheader('Content-Length', str(len(before) + file.stat().st_size + len(after)))
        conn.endheaders()
        conn.send(before)
        with file.open('rb') as stream:
            while chunk := stream.read(1024 * 1024):
                conn.send(chunk)
        conn.send(after)
        response = conn.getresponse()
        body = response.read(4096).decode('utf-8', errors='replace').strip()
        if not 200 <= response.status < 300:
            raise ValueError(f'Upload failed (HTTP {response.status}); do not retry until checking the result')
        if not re.fullmatch(r'[A-Za-z0-9_-]+_p\.zip', body, flags=re.I):
            raise ValueError('Storage did not return a protected ZIP hash; inspect the upload without exposing its URL')
        return {'hash': body, 'bytes': file.stat().st_size}
    finally:
        conn.close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--upload-json', type=Path, required=True)
    parser.add_argument('--file', type=Path, required=True)
    args = parser.parse_args()
    try:
        settings = json.loads(args.upload_json.read_text())
        print(json.dumps(upload(args.file, settings)))
    except (OSError, ValueError, KeyError, http.client.HTTPException) as error:
        # No traceback: a signed URL must not leak through exception context.
        parser.exit(1, f'Upload not confirmed: {type(error).__name__}. Check the SDK response, file and connection before retrying.\n')
