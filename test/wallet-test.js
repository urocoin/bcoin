var assert = require('assert');
var bn = require('bn.js');
var bcoin = require('../');

describe('Wallet', function() {
  it('should generate new key and address', function() {
    var w = bcoin.wallet();
    var addr = w.getAddress();
    assert(addr);
    assert(bcoin.wallet.validateAddress(addr));
  });

  it('should validate existing address', function() {
    assert(bcoin.wallet.validateAddress('UhtP7ev1oLZyv3hR99qRQyw6dGxTVwp3vu'));
  });

  it('should fail to validate invalid address', function() {
    assert(!bcoin.wallet.validateAddress('UhtP7ev1oLZyv3hR99qRQyw6dGxTVwp3vv'));
  });

  it('should sign/verify TX', function() {
    var w = bcoin.wallet();

    // Input transcation
    var src = bcoin.tx({
      outputs: [{
        value: 5460 * 2,
        address: w.getAddress()
      }, {
        value: 5460 * 2,
        address: w.getAddress() + 'x'
      }]
    });
    assert(w.ownOutput(src));
    assert.equal(w.ownOutput(src).reduce(function(acc, out) {
      return acc.iadd(out.value);
    }, new bn(0)).toString(10), 5460 * 2);

    var tx = bcoin.tx()
      .input(src, 0)
      .out(w.getAddress(), 5460);

    w.sign(tx);
    assert(tx.verify());
  });

  it('should multisign/verify TX', function() {
    var w = bcoin.wallet();

    // Input transcation
    var src = bcoin.tx({
      outputs: [{
        value: 5460 * 2,
        minSignatures: 1,
        address: [ w.getPublicKey(), w.getPublicKey().concat(1) ]
      }, {
        value: 5460 * 2,
        address: w.getAddress() + 'x'
      }]
    });
    assert(w.ownOutput(src));
    assert.equal(w.ownOutput(src).reduce(function(acc, out) {
      return acc.iadd(out.value);
    }, new bn(0)).toString(10), 5460 * 2);

    var tx = bcoin.tx()
      .input(src, 0)
      .out(w.getAddress(), 5460);

    var maxSize = tx.maxSize();
    w.sign(tx);
    assert(tx.render().length <= maxSize);
    assert(tx.verify());
  });

  it('should have TX pool and be serializable', function() {
    var w = bcoin.wallet();
    var f = bcoin.wallet();

    // Coinbase
    var t1 = bcoin.tx().out(w, 50000).out(w, 1000);
    w.sign(t1);
    var t2 = bcoin.tx().input(t1, 0)
                       .out(w, 24000)
                       .out(w, 24000);
    w.sign(t2);
    var t3 = bcoin.tx().input(t1, 1)
                       .input(t2, 0)
                       .out(w, 23000);
    w.sign(t3);
    var t4 = bcoin.tx().input(t2, 1)
                       .input(t3, 0)
                       .out(w, 11000)
                       .out(w, 11000);
    w.sign(t4);
    var f1 = bcoin.tx().input(t4, 1)
                       .out(f, 10000);
    w.sign(f1);
    var fake = bcoin.tx().input(t1, 1)
                         .out(w, 500);

    // Just for debugging
    t1.hint = 't1';
    t2.hint = 't2';
    t3.hint = 't3';
    t4.hint = 't4';
    f1.hint = 'f1';
    fake.hint = 'fake';

    // Fake TX should temporarly change output
    w.addTX(fake);

    w.addTX(t4);
    assert.equal(w.balance().toString(10), '22500');
    w.addTX(t1);
    assert.equal(w.balance().toString(10), '73000');
    w.addTX(t2);
    assert.equal(w.balance().toString(10), '47000');
    w.addTX(t3);
    assert.equal(w.balance().toString(10), '22000');
    w.addTX(f1);
    assert.equal(w.balance().toString(10), '11000');
    assert(w.all().some(function(tx) {
      return tx.hash('hex') === f1.hash('hex');
    }));

    var w2 = bcoin.wallet.fromJSON(w.toJSON());
    assert.equal(w2.balance().toString(10), '11000');
    assert(w2.all().some(function(tx) {
      return tx.hash('hex') === f1.hash('hex');
    }));
  });

  it('should fill tx with inputs', function(cb) {
    var w1 = bcoin.wallet();
    var w2 = bcoin.wallet();

    // Coinbase
    var t1 = bcoin.tx().out(w1, 5460).out(w1, 5460).out(w1, 5460).out(w1, 5460);

    // Fake TX should temporarly change output
    w1.addTX(t1);

    // Create new transaction
    var t2 = bcoin.tx().out(w2, 5460);
    w1.fill(t2, function(err) {
      assert(!err);
      assert(t2.verify());

      assert.equal(t2.funds('in').toString(10), 16380);
      assert.equal(t2.funds('out').toString(10), 6380);

      // Create new transaction
      var t3 = bcoin.tx().out(w2, 15000);
      w1.fill(t3, function(err) {
        assert(err);
        assert.equal(err.minBalance.toString(10), 25000);

        cb();
      });
    });
  });

  it('should sign multiple inputs using different keys', function(cb) {
    var w1 = bcoin.wallet();
    var w2 = bcoin.wallet();
    var to = bcoin.wallet();

    // Coinbase
    var t1 = bcoin.tx().out(w1, 5460).out(w1, 5460).out(w1, 5460).out(w1, 5460);
    // Fake TX should temporarly change output
    w1.addTX(t1);
    // Coinbase
    var t2 = bcoin.tx().out(w2, 5460).out(w2, 5460).out(w2, 5460).out(w2, 5460);
    // Fake TX should temporarly change output
    w2.addTX(t2);

    // Create our tx with an output
    var tx = bcoin.tx();
    tx.out(to, 5460);

    var cost = tx.funds('out');
    var total = cost.add(new bn(w1.fee));

    var unspent1 = w1.unspent();
    var unspent2 = w2.unspent();

    // Add dummy output (for `left`) to calculate maximum TX size
    tx.out(w1, new bn(0));

    // Add our unspent inputs to sign
    tx.input(unspent1[0]);
    tx.input(unspent1[1]);
    tx.input(unspent2[0]);

    var left = tx.funds('in').sub(total);
    if (left.cmpn(w1.dust) < 0) {
      tx.outputs[tx.outputs.length - 2].value.iadd(left);
      left = new bn(0);
    }
    if (left.cmpn(0) === 0)
      tx.outputs.pop();
    else
      tx.outputs[tx.outputs.length - 1].value = left;

    // Sign transaction
    assert.equal(w1.sign(tx), 2);
    assert.equal(w2.sign(tx), 1);

    // Verify
    assert.equal(tx.verify(), true);

    // Sign transaction using `inputs` and `off` params.
    tx.inputs.length = 0;
    tx.input(unspent1[1]);
    tx.input(unspent1[2]);
    tx.input(unspent2[1]);
    assert.equal(w1.sign(tx, 'all', tx.inputs.slice(), 0), 2);
    assert.equal(w2.sign(tx, 'all', tx.inputs.slice(2), 2), 1);

    // Verify
    assert.equal(tx.verify(), true);

    cb();
  });
});
