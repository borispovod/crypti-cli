var cryptoLib = require('../lib/crypto.js');
var ByteBuffer = require('bytebuffer');
var bignum = require('browserify-bignum');
var crypto = require('crypto');

function getBytes(block, skipSignature) {
	var size = 8 + 4 + 4 + 4 + 32 + 32 + 8 + 4 + 4 + 64 + (block.delegates.length * 32);

	var bb = new ByteBuffer(size, true);

	if (block.prevBlockId) {
		var pb = bignum(block.prevBlockId).toBuffer({size: '8'});
		for (var i = 0; i < 8; i++) {
			bb.writeByte(pb[i]);
		}
	} else {
		for (var i = 0; i < 8; i++) {
			bb.writeByte(0);
		}
	}

	bb.writeInt(block.height);
	bb.writeInt(block.timestamp);
	bb.writeInt(block.payloadLength);

	var ph = new Buffer(block.payloadHash, 'hex');
	for (var i = 0; i < ph.length; i++) {
		bb.writeByte(ph[i]);
	}

	var pb = new Buffer(block.delegate, 'hex');
	for (var i = 0; i < pb.length; i++) {
		bb.writeByte(pb[i]);
	}

	var pb = bignum(block.pointId).toBuffer({size: '8'});
	for (var i = 0; i < 8; i++) {
		bb.writeByte(pb[i]);
	}

	bb.writeInt(block.pointHeight);

	bb.writeInt(block.count);

	for (var i = 0; i < block.delegates.length; i++) {
		var delegate = block.delegates[i];
		var delegateBuffer = new Buffer(delegate, 'hex');

		for (var j = 0; j < delegateBuffer.length; j++) {
			bb.writeByte(delegateBuffer[j]);
		}
	}

	if (!skipSignature && block.signature) {
		var pb = new Buffer(block.signature, 'hex');
		for (var i = 0; i < pb.length; i++) {
			bb.writeByte(pb[i]);
		}
	}

	bb.flip();
	var b = bb.toBuffer();

	return b;
}

module.exports = {
	new: function (genesisAccount, genesisBlock, publicKeys) {
		var block = {
			delegate: genesisAccount.keypair.publicKey,
			delegates: publicKeys,
			height: 1,
			pointId: genesisBlock.id,
			pointHeight: 1,
			payloadLength: 0,
			payloadHash: crypto.createHash('sha256').digest().toString('hex'),
			count: 0,
			transactions: [],
			timestamp: 0
		}

		var bytes = getBytes(block);
		block.signature = cryptoLib.sign(genesisAccount.keypair, bytes);
		bytes = getBytes(block);
		block.id = cryptoLib.getId(bytes);

		return block;
	}
}