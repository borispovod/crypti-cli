var private = {}, self = null,
	library = null, modules = null;

function test(cb, _library) {
	self = this;
	self.type = 7
	library = _library;
	cb(null, self);
}

test.prototype.create = function (data, trs) {
	return trs;
}

test.prototype.calculateFee = function (trs) {
	return 0;
}

test.prototype.verify = function (trs, sender, cb, scope) {
	setImmediate(cb, null, trs);
}

test.prototype.getBytes = function (trs) {
	return null;
}

test.prototype.apply = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

test.prototype.undo = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

test.prototype.applyUnconfirmed = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

test.prototype.undoUnconfirmed = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

test.prototype.ready = function (trs, sender, cb, scope) {
	setImmediate(cb);
}

test.prototype.save = function (trs, cb) {
	setImmediate(cb);
}

test.prototype.dbRead = function (row) {
	return null;
}

test.prototype.normalize = function (asset, cb) {
	setImmediate(cb);
}

test.prototype.onBind = function (_modules) {
	modules = _modules;
	modules.logic.transaction.attachAssetType(self.type, self);
}

module.exports = test;