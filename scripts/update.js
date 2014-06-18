// Update preloader
var assert = require('assert');
var dns = require('dns');
var net = require('net');
var path = require('path');
var bcoin = require('../');

var addrs = [
  '128.199.204.45',
  '148.251.70.194',
  '144.76.238.2',
  '62.210.141.204',
  '162.243.193.232',
  '23.226.228.25',
  '192.99.3.15',
  '188.226.239.21'
];

var pool = bcoin.pool({
  size: 32,
  redundancy: 1,
  parallel: 4000,
  loadWindow: 750,
  createConnection: function() {
    console.log('connecting...');
    return net.connect(36348, addrs[(Math.random() * addrs.length) | 0]);
  }
});

console.log('Updating bcoin preloaded chain...');

pool.on('block', function(block) {
  console.log('Got: %s from %s chain len %d orp %d act %d queue %d',
              block.hash('hex'),
              new Date(block.ts * 1000).toString(),
              pool.chain.index.hashes.length,
              pool.chain.orphan.count,
              pool.request.active,
              pool.request.queue.length);
});

pool.on('addr', function(data) {
  if (data.port !== 36348) return;
  console.log('Found new peer: %s', data.host);
  addrs.push(data.address);
});

pool.once('full', finish);
process.once('SIGINT', finish);

var once = false;
function finish() {
  if (once)
    return;
  once = true;

  console.log('Done...');
  var chain = '// Autogenerated, use scripts/update.js to update\n' +
              'module.exports = ' +
              JSON.stringify(pool.chain.toJSON(), null, 2) + '\n';
  var file =
      path.resolve(__dirname, '..', 'lib', 'bcoin', 'protocol', 'preload.js');

  require('fs').writeFileSync(file, chain);
  pool.destroy();
}
