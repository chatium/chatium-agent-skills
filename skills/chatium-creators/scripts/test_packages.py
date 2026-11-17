#!/usr/bin/env python3
"""Offline packaging and upload protocol checks; no real account mutations."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import zipfile
from package_template import package
from upload_template import upload


class Packages(unittest.TestCase):
    def test_explicit_deterministic_package(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'src').mkdir()
            (root / 'src' / 'index.ts').write_text('export const title = "CRM"\n')
            (root / 'README.md').write_text('How to use this template')
            (root / '.env').write_text('PRIVATE=value')
            one = package(root, ['README.md', 'src'], root / 'one.zip')
            two = package(root, ['src', 'README.md'], root / 'two.zip')
            self.assertEqual(one['sha256'], two['sha256'])
            with zipfile.ZipFile(root / 'one.zip') as archive:
                self.assertEqual(archive.namelist(), ['README.md', 'src/index.ts'])
            for selected in [['.env'], ['../outside'], ['.']]:
                with self.assertRaises(ValueError):
                    package(root, selected, root / 'bad.zip')
            (root / 'linked').symlink_to(root / 'README.md')
            with self.assertRaises(ValueError):
                package(root, ['linked'], root / 'bad.zip')
            with self.assertRaises(ValueError):
                package(root, ['README.md'], root / 'one.zip')

    def test_upload_protocol_and_rejected_responses(self):
        class Response:
            status = 200
            body = b'msk_uploaded_p.zip'
            def read(self, _): return self.body
        class Connection:
            def __init__(self, *_args, **_kwargs): self.parts = []; self.headers = {}
            def putrequest(self, method, path): self.method, self.path = method, path
            def putheader(self, key, value): self.headers[key] = value
            def endheaders(self): pass
            def send(self, part): self.parts.append(part)
            def getresponse(self): return response
            def close(self): pass
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'template.zip'
            with zipfile.ZipFile(file, 'w') as archive: archive.writestr('README.md', 'Hello')
            settings = {'uploadUrl': 'https://storage.example.test/upload?token=secret', 'fieldName': 'Filedata'}
            response = Response(); connection = Connection()
            with patch('upload_template.http.client.HTTPSConnection', return_value=connection):
                result = upload(file, settings)
                self.assertEqual(result['hash'], 'msk_uploaded_p.zip')
                body = b''.join(connection.parts)
                self.assertEqual(int(connection.headers['Content-Length']), len(body))
                self.assertIn(file.read_bytes(), body)
                self.assertIn(b'name="Filedata"', body)
                self.assertNotIn('secret', json.dumps(result))
                response.status = 302
                with self.assertRaises(ValueError): upload(file, settings)
                response.status = 200; response.body = b'public.zip'
                with self.assertRaises(ValueError): upload(file, settings)
            with self.assertRaises(ValueError): upload(file, {**settings, 'uploadUrl':'http://unsafe.test/upload'})


if __name__ == '__main__':
    unittest.main()
