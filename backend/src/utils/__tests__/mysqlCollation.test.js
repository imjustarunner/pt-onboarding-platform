import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MYSQL_SET_NAMES_SQL,
  sqlNonEmpty,
  sqlUnicodeEq,
  sqlUnicodeLiteral,
  sqlUnicodeNe,
  sqlUnicodeParam
} from '../mysqlCollation.js';

describe('mysqlCollation helpers', () => {
  it('pins SET NAMES to unicode_ci so bound params match schema tables', () => {
    assert.equal(MYSQL_SET_NAMES_SQL, 'SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci');
  });

  it('compares two expressions with unicode_ci on both sides', () => {
    assert.equal(
      sqlUnicodeEq('LOWER(sc.email)', 'LOWER(u.email)'),
      'LOWER(sc.email) COLLATE utf8mb4_unicode_ci = LOWER(u.email) COLLATE utf8mb4_unicode_ci'
    );
  });

  it('binds parameters through CONVERT so connection 0900 cannot mix', () => {
    assert.equal(
      sqlUnicodeParam('public_key'),
      'public_key COLLATE utf8mb4_unicode_ci = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci'
    );
  });

  it('compares role/status literals without inheriting connection collation', () => {
    assert.equal(
      sqlUnicodeLiteral("LOWER(COALESCE(u.role, ''))", 'school_staff'),
      "LOWER(COALESCE(u.role, '')) COLLATE utf8mb4_unicode_ci = 'school_staff' COLLATE utf8mb4_unicode_ci"
    );
    assert.equal(
      sqlUnicodeNe("UPPER(COALESCE(u.status, ''))", "'ARCHIVED'"),
      "UPPER(COALESCE(u.status, '')) COLLATE utf8mb4_unicode_ci <> 'ARCHIVED' COLLATE utf8mb4_unicode_ci"
    );
  });

  it('checks non-empty strings without a collation-sensitive equals', () => {
    assert.equal(sqlNonEmpty('u.email'), "CHAR_LENGTH(TRIM(COALESCE(u.email, ''))) > 0");
  });
});
