var inherits = require('inherits');
var EventEmitter = require('events').EventEmitter;

var bcoin = require('../bcoin');
var utils = bcoin.utils;
var assert = utils.assert;
var constants = bcoin.protocol.constants;

// Browserify, I'm looking at you
try {
  var NodeBuffer = require('buf' + 'fer').Buffer;
} catch (e) {
}

function Peer(pool, createSocket, options) {
  if (!(this instanceof Peer))
    return new Peer(pool, createSocket, options);

  EventEmitter.call(this);

  this.options = options || {};
  this.pool = pool;
  this.socket = null;
  this.parser = new bcoin.protocol.parser();
  this.framer = new bcoin.protocol.framer();
  this.chain = this.pool.chain;
  this.bloom = this.pool.bloom;
  this.version = null;
  this.destroyed = false;
  this.ack = false;
  this.ts = this.options.ts || 0;

  if (this.options.backoff) {
    var self = this;
    setTimeout(function() {
      self.socket = createSocket();
      self.emit('socket');
    }, this.options.backoff);
  } else {
    this.socket = createSocket();
  }

  this._broadcast = {
    timeout: this.options.broadcastTimeout || 30000,
    interval: this.options.broadcastInterval || 3000,
    map: {}
  };

  this._request = {
    timeout: this.options.requestTimeout || 10000,
    cont: {},
    skip: {},
    queue: []
  };

  this._ping = {
    timer: null,
    interval: this.options.pingInterval || 30000
  };

  this.setMaxListeners(4000);

  if (this.socket)
    this._init();
  else
    this.once('socket', this._init);
}
inherits(Peer, EventEmitter);
module.exports = Peer;

Peer.prototype._init = function init() {
  var self = this;
  this.socket.once('connect', function() {
    self.ts = Date.now() / 1000 | 0;
  });
  this.socket.once('error', function(err) {
    self._error(err);
  });
  this.socket.once('close', function() {
    self._error('socket hangup');
  });
  this.socket.on('data', function(chunk) {
    self.parser.feed(chunk);
  });
  this.parser.on('packet', function(packet) {
    self._onPacket(packet);
  });
  this.parser.on('error', function(err) {
    self._error(err);
  });

  this._ping.timer = setInterval(function() {
    self._write(self.framer.ping([
      0xde, 0xad, 0xbe, 0xef,
      0xde, 0xad, 0xbe, 0xef
    ]));
  }, this._ping.interval);

  // Send hello
  this._write(this.framer.version({
    height: this.options.startHeight != null
      ? this.options.startHeight
      : 0,
    relay: this.options.relay
  }));

  this._req('verack', function(err, payload) {
    if (err)
      return self._error(err);
    self.ack = true;
    self.emit('ack');
    self.ts = Date.now() / 1000 | 0;
  });
};

Peer.prototype.broadcast = function broadcast(items) {
  if (this.destroyed)
    return;
  if (!Array.isArray(items))
    items = [ items ];

  var self = this;
  var result = items.map(function(item) {
    var key = item.hash('hex');
    var old = this._broadcast.map[key];
    if (old) {
      clearTimeout(old.timer);
      clearInterval(old.interval);
    }

    var inv =  this.framer.inv([{
      type: item.type,
      hash: item.hash()
    }]);

    // Auto-cleanup broadcast map after timeout
    var entry = {
      e: new EventEmitter(),
      timeout: setTimeout(function() {
        entry.e.emit('timeout');
        clearInterval(entry.interval);
        delete self._broadcast.map[key];
      }, this._broadcast.timeout),

      // Retransmit
      interval: setInterval(function() {
        self._write(inv);
      }, this._broadcast.interval),

      type: item.type,
      value: item.render()
    };

    this._broadcast.map[key] = entry;

    return entry.e;
  }, this);

  this._write(this.framer.inv(items.map(function(item) {
    return {
      type: item.type,
      hash: item.hash()
    };
  })));

  return result;
};

Peer.prototype.updateWatch = function updateWatch() {
  if (!this.pool.options.relay) {
    if (this.ack) {
      var self = this;
      if (this.pool.block.lastHash)
        this.loadBlocks([ self.pool.block.lastHash ], 0);
      else
        this.pool.chain.getLast(function(hash) {
          self.loadBlocks([ hash ], 0);
        });
    }
    return;
  }

  if (this.ack)
    this._write(this.framer.filterLoad(this.bloom, 'none'));
};

Peer.prototype.destroy = function destroy() {
  if (this.destroyed)
    return;
  if (!this.socket)
    return this.once('socket', this.destroy);

  this.destroyed = true;
  this.socket.destroy();
  this.socket = null;
  this.emit('close');

  // Clean-up timeouts
  Object.keys(this._broadcast.map).forEach(function(key) {
    clearTimeout(this._broadcast.map[key].timer);
    clearInterval(this._broadcast.map[key].interval);
  }, this);

  clearInterval(this._ping.timer);
  this._ping.timer = null;

  for (var i = 0; i < this._request.queue.length; i++)
    clearTimeout(this._request.queue[i].timer);
};

// Private APIs

Peer.prototype._write = function write(chunk) {
  if (this.destroyed)
    return;
  if (!this.socket) {
    return this.once('socket', function() {
      this._write(chunk);
    });
  }
  if (NodeBuffer)
    this.socket.write(new NodeBuffer(chunk));
  else
    this.socket.write(chunk);
};

Peer.prototype._error = function error(err) {
  if (this.destroyed)
    return;
  this.destroy();
  this.emit('error', typeof err === 'string' ? new Error(err) : err);
};

Peer.prototype._req = function _req(cmd, cb) {
  if (this.destroyed)
    return cb(new Error('Destroyed, sorry'));

  var self = this;
  var entry = {
    cmd: cmd,
    cb: cb,
    ontimeout: function() {
      var i = self._request.queue.indexOf(entry);
      if (i !== -1) {
        self._request.queue.splice(i, 1);
        cb(new Error('Timed out: ' + cmd), null);
      }
    },
    timer: null
  };
  entry.timer = setTimeout(entry.ontimeout, this._request.timeout);
  this._request.queue.push(entry);

  return entry;
};

Peer.prototype._res = function _res(cmd, payload) {
  for (var i = 0; i < this._request.queue.length; i++) {
    var entry = this._request.queue[i];
    if (!entry || entry.cmd && entry.cmd !== cmd)
      return false;

    var res = entry.cb(null, payload, cmd);

    if (res === this._request.cont) {
      assert(!entry.cmd);

      // Restart timer
      if (!this.destroyed)
        entry.timer = setTimeout(entry.ontimeout, this._request.timeout);
      return true;
    } else if (res !== this._request.skip) {
      this._request.queue.shift();
      clearTimeout(entry.timer);
      entry.timer = null;
      return true;
    }
  }

  return false;
};

Peer.prototype.getData = function getData(items) {
  this._write(this.framer.getData(items));
};

Peer.prototype._onPacket = function onPacket(packet) {
  var cmd = packet.cmd;
  var payload = packet.payload;

  if (cmd === 'version')
    return this._handleVersion(payload);
  else if (cmd === 'inv')
    return this._handleInv(payload);
  else if (cmd === 'getdata')
    return this._handleGetData(payload);
  else if (cmd === 'addr')
    return this._handleAddr(payload);
  else if (cmd === 'ping')
    return this._handlePing(payload);
  else if (cmd === 'pong')
    return this._handlePong(payload);
  else if (cmd === 'getaddr')
    return this._handleGetAddr();

  if (cmd === 'merkleblock' || cmd === 'block') {
    payload = bcoin.block(payload, cmd);
    this.lastBlock = payload;
  } else if (cmd === 'tx') {
    payload = bcoin.tx(payload, this.lastBlock);
  }
  if (this._res(cmd, payload))
    return;
  else
    this.emit(cmd, payload);
};

Peer.prototype._handleVersion = function handleVersion(payload) {
  if (payload.v < constants.minVersion)
    return this._error('peer doesn\'t support required protocol version');

  // ACK
  this._write(this.framer.verack());
  this.version = payload;
  this.emit('version', payload);
};

Peer.prototype._handleGetData = function handleGetData(items) {
  items.forEach(function(item) {
    // Filter out not broadcasted things
    var hash = utils.toHex(item.hash);
    if (!this._broadcast.map[hash])
      return;

    var entry = this._broadcast.map[hash];
    this._write(this.framer.packet(entry.type, entry.value));
    entry.e.emit('request');
  }, this);
};

Peer.prototype._handleAddr = function handleAddr(addrs) {
  var now = Date.now();
  addrs.forEach(function(addr) {
    // bitcoind does this for some reason:
    if (addr.ts <= 100000000 || addr.ts > now + 10 * 60)
      addr.ts = now - 5 * 24 * 60 * 60;
    this.emit('addr', {
      date: new Date(addr.ts * 1000),
      ts: addr.ts,
      service: addr.service,
      ipv4: addr.ipv4,
      ipv6: addr.ipv6,
      address: addr.ipv4,
      address6: addr.ipv6,
      port: addr.port,
      host: addr.ipv4 + ':' + addr.port,
      host6: '[' + addr.ipv6 + ']:' + addr.port
    });
  }, this);
};

Peer.prototype._handlePing = function handlePing() {
  // No-op for now
};

Peer.prototype._handlePong = function handlePong() {
  // No-op for now
};

Peer.prototype._handleGetAddr = function handleGetAddr() {
  var used = [];
  var peers = [].concat(
    this.pool.peers.pending,
    this.pool.peers.block,
    this.pool.peers.load
  ).filter(Boolean);

  // NOTE: For IPv6 BTC uses:
  // '0000:0000:0000:0000:0000:xxxx:xxxx:ffff'

  peers = peers.map(function(peer) {
    if (!peer.socket || !peer.socket.remoteAddress)
      return;
    return {
      host: peer.socket.remoteAddress,
      port: peer.socket.remotePort || 36348,
      ts: peer.ts
    };
  }).filter(function(peer) {
    if (!peer || ~used.indexOf(peer.host))
      return;
    used.push(peer.host);
    return !!peer.host && utils.isIP(peer.host);
  }).map(function(peer) {
    var ip = peer.host;
    var ver = utils.isIP(ip);
    return {
      ipv4: ver === 4 ? ip : '127.0.0.1',
      ipv6: ver === 6 ? ip : '0000:0000:0000:0000:0000:0000:0000:ffff',
      port: peer.port,
      ts: peer.ts,
      ver: ver
    };
  });

  var addrs = peers.map(function(peer) {
    if (peer.ver === 6) {
      while (peer.ipv6.split(':').length < 8)
        peer.ipv6 = '0000:' + peer.ipv6;
      if (peer.ipv6.split(':').length > 8)
        return;
    }

    peer.ipv4 = peer.ipv4.split('.').map(function(n) {
      return +n;
    });

    peer.ipv6 = utils.toArray(peer.ipv6, 'hex');

    return peer;
  }).filter(Boolean);

  return this._write(this.framer.addr(addrs));
};

Peer.prototype._handleInv = function handleInv(items) {
  // Always request advertised TXs
  var txs = items.filter(function(item) {
    return item.type === 'tx';
  });

  // Emit new blocks to schedule them between multiple peers
  var blocks = items.filter(function(item) {
    return item.type === 'block';
  }, this).map(function(item) {
    return item.hash;
  });
  this.emit('blocks', blocks);

  if (!this.pool.options.relay) {
    if (txs.length)
      this.emit('txs', txs.map(function(tx) {
        return tx.hash;
      }));
    this.getData(items);
    return;
  }

  if (txs.length === 0)
    return;

  this.emit('txs', txs.map(function(tx) {
    return tx.hash;
  }));
  this.getData(txs);
};

Peer.prototype.loadBlocks = function loadBlocks(hashes, stop) {
  this._write(this.framer.getBlocks(hashes, stop));
};
