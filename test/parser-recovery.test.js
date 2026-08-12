'use strict';

const assert =
  require(
    'node:assert/strict'
  );

const test =
  require(
    'node:test'
  );

const {
  parseRupiah
} = require(
  '../src/utils/money'
);

const {
  RECOVERY_CONFIG,
  shouldAttemptParserRecovery
} = require(
  '../src/stores/parser-recovery'
);

test(
  'parseRupiah accepts white-label Rp spacing variants',
  () => {
    assert.equal(
      parseRupiah(
        'Rp . 21.635'
      ),
      21635
    );

    assert.equal(
      parseRupiah(
        'Rp. 4.378'
      ),
      4378
    );

    assert.equal(
      parseRupiah(
        'Rp 30,200'
      ),
      30200
    );

    assert.equal(
      parseRupiah(
        'IDR 25.000'
      ),
      25000
    );
  }
);

test(
  'parseRupiah still rejects arbitrary product numbers',
  () => {
    assert.equal(
      parseRupiah(
        '86 Diamonds'
      ),
      null
    );
  }
);

test(
  'parser recovery is opt-in only for affected stores',
  () => {
    assert.equal(
      Boolean(
        RECOVERY_CONFIG
          .gigames
      ),
      true
    );

    assert.equal(
      Boolean(
        RECOVERY_CONFIG
          .yoggstore
      ),
      true
    );

    assert.equal(
      Boolean(
        RECOVERY_CONFIG
          .codashop
      ),
      false
    );
  }
);

test(
  'parser recovery is only triggered for recoverable parser/page errors',
  () => {
    const store = {
      id: 'gigames'
    };

    assert.equal(
      shouldAttemptParserRecovery(
        store,
        {
          code:
            'PARSER_FAILED'
        }
      ),
      true
    );

    assert.equal(
      shouldAttemptParserRecovery(
        store,
        {
          code:
            'PAGE_NOT_FOUND'
        }
      ),
      true
    );

    assert.equal(
      shouldAttemptParserRecovery(
        store,
        {
          code:
            'ACCESS_BLOCKED'
        }
      ),
      false
    );

    assert.equal(
      shouldAttemptParserRecovery(
        {
          id:
            'codashop'
        },
        {
          code:
            'PARSER_FAILED'
        }
      ),
      false
    );
  }
);
