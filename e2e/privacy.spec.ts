import fs from 'node:fs';
import path from 'node:path';
import {expect, test} from '@playwright/test';

function walk(dir: string): string[] {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap((entry) => {
    const target = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

test('production client chunks exclude the private Gmail capture', () => {
  const chunks = path.resolve('.next/static/chunks');
  expect(fs.existsSync(chunks)).toBe(true);
  const leaks = walk(chunks)
    .filter((file) => /\.(?:js|map)$/.test(file))
    .filter((file) => fs.readFileSync(file, 'utf8').includes('mail.google.com/mail/u/0/#all/'));
  expect(leaks).toEqual([]);
});
