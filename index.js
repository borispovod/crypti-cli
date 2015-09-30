var inquirer = require("inquirer");
var program = require('commander');
var accountHelper = require('./helpers/account.js');
var blockHelper = require('./helpers/block.js');
var dappHelper = require('./helpers/dapp.js');
var gift = require('gift');
var fs = require('fs');
var path = require('path');
var rmdir = require('rmdir');
var cryptoLib = require('./lib/crypto.js');
var npm = require('npm');
var toolkit = "git@github.com:crypti/DAppToolkit.git";

program.version('0.0.1');

program
	.command("dapps")
	.description("Manage your dapps")
	.option("-a, --add", "Add dapp")
	.option("-c, --change", "Change dapp genesis block")
	.option("-d, --deposit", "Deposit dapp")
	.option("-w, --withdrawal", "Withdrawal funds from dapp")
	.action(function (options) {
		if (options.add) {
			inquirer.prompt([
				{
					type: "confirm",
					name: "confirmed",
					message: "This operation need to remove old blockchain.db file and create new one, are you sure?",
					default: false
				}
			], function (result) {
				if (result.confirmed) {
					inquirer.prompt([
						{
							type: "password",
							name: "secret",
							message: "Put secret of your testnet account",
							validate: function (value) {
								var done = this.async();

								if (value.length == 0) {
									done("Secret must contain minimum 1 character");
									return;
								}

								if (value.length > 100) {
									done("Secret max length is 100 characters");
									return;
								}

								done(true);
							}
						}
					], function (result) {
						var account = accountHelper.account(result.secret);

						inquirer.prompt([
							{
								type: "confirm",
								name: "confirmed",
								message: "Update current genesis block? (or make new one)"
							}
						], function (result) {
							var genesisBlock = null;
							var newGenesisBlock = !result.confirmed;

							if (!newGenesisBlock) {
								try {
									var genesisBlock = JSON.parse(fs.readFileSync(path.join('.', 'genesisBlock.json'), 'utf8'));
								} catch (e) {
									console.log("Can't read genesisBlock.js: ", e.toString());
									return;
								}
							}

							inquirer.prompt([
								{
									type: "input",
									name: "name",
									message: "Your DApp name",
									required: true,
									validate: function (value) {
										var done = this.async();

										if (value.length == 0) {
											done("DApp name must minimum contain one character");
											return;
										}

										if (value.length > 32) {
											done("DApp name max length is 32 characters");
											return;
										}

										return done(true)
									}
								},
								{
									type: "input",
									name: "description",
									message: "Description",
									validate: function (value) {
										var done = this.async();

										if (value.length > 160) {
											done("DApp description max length is 160 characters");
											return;
										}

										return done(true);
									}
								},
								{
									type: "input",
									name: "git",
									message: "Github repository",
									required: true,
									validate: function (value) {
										var done = this.async();

										if (!(/^git\@github\.com\:.+\.git$/.test(value))) {
											done("Incorrect github repository link");
											return;
										}

										return done(true);
									}
								}
							], function (result) {
								console.log("Generating unique genesis block special for you...");

								// create dapp and save to genesis block
								var block, dapp, delegates;

								if (newGenesisBlock) {
									var r = blockHelper.new(account,
										{
											name: result.name,
											description: result.description,
											git: result.git,
											type: 0,
											category: 0
										}
									);

									block = r.block;
									dapp = r.dapp;
									delegates = r.delegates;
								} else {
									try {
										var r = blockHelper.from(genesisBlock, account,
											{
												name: result.name,
												description: result.description,
												git: result.git,
												type: 0,
												category: 0
											}
										);
									} catch (e) {
										return console.log(e);
									}

									block = r.block;
									dapp = r.dapp;
								}
									inquirer.prompt([
										{
											type: "input",
											name: "publicKeys",
											message: "Additional public keys of dapp forgers - hex array, use ',' for seperator",
											default: account.keypair.publicKey,
											validate: function (value) {
												var done = this.async();

												var publicKeys = value.split(',');

												if (publicKeys.length == 0) {
													done('DApp need minimum 1 public key');
													return;
												}

												for (var i in publicKeys) {
													try {
														var b = new Buffer(publicKeys[i], 'hex');
														if (b.length != 32) {
															done('Incorrect public key: ' + publicKeys[i]);
															return;
														}
													} catch (e) {
														done('Incorrect hex for public key: ' + publicKeys[i]);
														return;
													}
												}

												done(true);
											}
										}
									], function (result) {
										console.log("Creating DApp genesis block");

										var dappBlock = dappHelper.new(account, block, result.publicKeys.split(','));

										console.log("Fetch Crypti DApp Toolkit");

										var dappsPath = path.join('.', 'dapps');
										fs.exists(dappsPath, function (exists) {
											if (!exists) {
												fs.mkdirSync(dappsPath);
											}

										var dappPath = path.join(dappsPath, dapp.id);
										gift.clone(toolkit, dappPath, function (err, repo) {
											if (err) {
												return console.log(err.toString());
											}

											rmdir(path.join(dappPath, ".git"), function (err) {
												if (err) {
													return console.log(err.toString());
												}

												console.log("Connect local repository with your remote repository");
												gift.init(dappPath, function (err, repo) {
													if (err) {
														return console.log(err.toString());
													}

													repo.remote_add('origin', dapp.asset.dapp.git, function (err, repo) {
														if (err) {
															return console.log(err.toString());
														}

														var bcFile = path.join('.', 'blockchain.db');

														var exists = fs.existsSync(bcFile);
														if (exists) {
															fs.unlinkSync(bcFile);
														}

														// load npm config
														var packageJson = path.join(dappPath, "package.json");
														var config = null;

														try {
															config = JSON.parse(fs.readFileSync(packageJson));
														} catch (e) {
															return setImmediate(cb, "Incorrect package.json file for " + dApp.transactionId + " DApp");
														}

														npm.load(config, function (err) {
															npm.root = path.join(dappPath, "node_modules");
															npm.prefix = dappPath;

															npm.commands.install(function (err, data) {
																if (err) {
																	return console.log(err);
																} else {
																	console.log("Save genesis blocks");
																	var genesisBlockJson = JSON.stringify(block, null, 4);

																	try {
																		fs.writeFileSync(path.join('.', 'genesisBlock.json'), genesisBlockJson, "utf8");
																	} catch (e) {
																		return console.log(err);
																	}

																	var dappGenesisBlockJson = JSON.stringify(dappBlock, null, 4);

																	try {
																		fs.writeFileSync(path.join(dappPath, 'genesis.json'), dappGenesisBlockJson, "utf8");
																	} catch (e) {
																		return console.log(err);
																	}

																	console.log("Update config");

																	try {
																		var config = JSON.parse(fs.readFileSync(path.join('.', 'config.json'), 'utf8'));
																	} catch (e) {
																		return console.log(e);
																	}

																	if (newGenesisBlock) {
																		config.forging = config.forging || {};
																		config.forging.secret = delegates.map(function (d) {
																			return d.secret;
																		});
																	}

																	inquirer.prompt([
																		{
																			type: "confirm",
																			name: "confirmed",
																			message: "Add dapp to autolaunch"
																		}
																	], function (result) {
																		if (result.confirmed) {
																			config.dapp = config.dapp || {};
																			config.dapp.autoexec = config.dapp.autoexec || [];
																			config.dapp.autoexec.push({
																				params: [
																					account.secret,
																					"modules.full.json"
																				],
																				dappid: dapp.id
																			})
																		}

																		fs.writeFile(path.join('.', 'config.json'), JSON.stringify(config, null, 2), function (err) {
																			if (err) {
																				console.log(err);
																			} else {
																				console.log("Done (DApp id is " + dapp.id + ")");
																			}
																		});
																	});
																}
															});
														});
													});
												});
											});
										});
									});

								});
							});
						});
					});
				}
			});
		} else if (options.change) {
			inquirer.prompt([
				{
					type: "confirm",
					name: "confirmed",
					message: "This operation need to remove old blockchain.db file and create new one, are you sure?",
					default: false
				}
			], function (result) {
				if (result.confirmed) {
					inquirer.prompt([
						{
							type: "password",
							name: "secret",
							message: "Put secret of your testnet account",
							validate: function (value) {
								var done = this.async();

								if (value.length == 0) {
									done("Secret must contain minimum 1 character");
									return;
								}

								if (value.length > 100) {
									done("Secret max length is 100 characters");
									return;
								}

								done(true);
							}
						}
					], function (result) {
						var account = accountHelper.account(result.secret);

						inquirer.prompt([
							{
								type: "input",
								name: "dappId",
								message: "Your dapp id (folder name of dapp)",
								required: true,
								validate: function (value) {
									var done = this.async();

									var isId = /^[0-9]$/g;
									if (!isId.test(value)) {
										done("This is not dapp id");
										return;
									}

									done(true);
								}
							},
						], function (result) {
							var dappId = result.dappId,
								publicKeys = [];

							var dappPath = path.join('.', 'dapps', dappId);
							var dappGenesis = require(path.join(dappPath, 'genesis.json'));

							inquirer.prompt([
								{
									type: "confirm",
									name: "confirmed",
									message: "Continue with exists forgers public keys",
									required: true,
								}], function (result) {
								if (result.confirmed) {
									publicKeys = dappGenesis.delegates;
								}


								inquirer.prompt([
									{
										type: "input",
										name: "publicKeys",
										message: "Additional public keys of dapp forgers - hex array, use ',' for seperator",
										default: account.keypair.publicKey,
										validate: function (value) {
											var done = this.async();

											var publicKeys = value.split(',');

											if (publicKeys.length == 0) {
												done('DApp need minimum 1 public key');
												return;
											}

											for (var i in publicKeys) {
												try {
													var b = new Buffer(publicKeys[i], 'hex');
													if (b.length != 32) {
														done('Incorrect public key: ' + publicKeys[i]);
														return;
													}
												} catch (e) {
													done('Incorrect hex for public key: ' + publicKeys[i]);
													return;
												}
											}

											done(true);
										}
									}
								], function (result) {
									publicKeys = publicKeys.concat(result.publicKeys.split(','));

									// generate new genesis block
									console.log("Creating DApp genesis block");

									var bcFile = path.join('.', 'blockchain.db');

									var exists = fs.existsSync(bcFile);
									if (exists) {
										fs.unlinkSync(bcFile);
									}

									var dappBlock = dappHelper.new(account, block, result.publicKeys.split(','));

									var dappGenesisBlockJson = JSON.stringify(dappBlock, null, 4);

									try {
										fs.writeFileSync(path.join(dappPath, 'genesis.json'), dappGenesisBlockJson, "utf8");
									} catch (e) {
										return console.log(err);
									}

									console.log("Done");
								});
							});
						});
					});

				}
			});
		} else if (options.deposit) {
			inquirer.prompt([
				{
					type: "password",
					name: "secret",
					message: "Your secret",
					validate: function (value) {
						return value.length > 0 && value.length < 100;
					},
					required: true
				},
				{
					type: "input",
					name: "amount",
					message: "Amount",
					validate: function (value) {
						return !isNaN(parseInt(value));
					},
					required: true
				},
				{
					type: "input",
					name: "dappId",
					message: "DApp Id",
					validate: function (value) {
						var isAddress = /^[0-9]$/g;
						return isAddress.test(value);
					},
					required: true
				},
				{
					type: "input",
					name: "secondSecret",
					message: "Second secret, if you have it",
					validate: function (value) {
						return value.length < 100;
					},
					required: false
				}
			], function (result) {
				// body
				var body = {
					secret: result.secret,
					dappId: result.dappId,
					amount: result.amount
				};

				if (result.secondSecret && result.secondSecret.length > 0) {
					body.secondSecret = result.secondSecret;
				}

				request({
					url: "http://localhost:7040/api/dapps/" + result.dappId + "/transactions",
					method: "post",
					json: true,
					body: body
				}, function (err, resp, body) {
					if (err) {
						return console.log(err.toString());
					}

					if (body.success) {
						console.log(body.transactionId);
					} else {
						return console.log(body.error);
					}
				});
			});
		} else if (options.withdrawal) {
			inquirer.prompt([
				{
					type: "password",
					name: "secret",
					message: "Your secret",
					validate: function (value) {
						return value.length > 0 && value.length < 100;
					},
					required: true
				},
				{
					type: "input",
					name: "amount",
					message: "Amount",
					validate: function (value) {
						return !isNaN(parseInt(value));
					},
					required: true
				},
				{
					type: "input",
					name: "dappId",
					message: "DApp Id",
					validate: function (value) {
						var isAddress = /^[0-9]$/g;
						return isAddress.test(value);
					},
					required: true
				}], function (result) {

				var body = {
					secret: result.secret,
					amount: result.amount
				};


				request({
					url: "http://localhost:7040/api/dapps/" + result.dappId + "/api/withdrawal",
					method: "post",
					json: true,
					body: body
				}, function (err, resp, body) {
					if (err) {
						return console.log(err.toString());
					}

					if (body.success) {
						console.log(body.response.transactionId);
					} else {
						return console.log(body.error);
					}
				});
			});
		} else {
			console.log("'node dapps -h' to get help");
		}
	});

program
	.command('contract')
	.description('contract operations')
	.option('-a, --add', "Add new contract")
	.option('-d, --delete', "Delete contract")
	.action(function (options) {
		var contractsPath = path.join('.', 'modules', 'contracts');
		fs.exists(contractsPath, function (exist) {
			if (exist) {
				if (options.add) {
					fs.readdir(contractsPath, function (err, filenames) {
						if (err) {
							return console.log(err);
						}

						inquirer.prompt([
							{
								type: "input",
								name: "filename",
								message: "Contract file name (without .js)"
							}
						], function (result) {
							var name = result.filename,
								type = filenames.length + 1,
								filename = result.filename + ".js";

							fs.readFile(path.join(__dirname, "contract-example.js"), "utf8", function (err, exampleContract) {
								if (err) {
									return console.log(err);
								}

								exampleContract = exampleContract.replace(/ExampleContract/g, name);
								exampleContract = exampleContract.replace("//self.type = null;", "self.type = " + type);

								fs.writeFile(path.join(contractsPath, filename), exampleContract, "utf8", function (err) {
									if (err) {
										return console.log(err);
									} else {
										console.log("New contract created: " + ("./contracts/" + filename));
										console.log("Update list of contracts");

										fs.readFile(path.join('.', 'modules.full.json'), 'utf8', function (err, text) {
											if (err) {
												return console.log(err);
											}

											try {
												var modules = JSON.parse(text);
											} catch (e) {
												return console.log(e);
											}

											var contractName = "contracts/" + name;
											var dappPathConfig = path.join(contractsPath, filename);

											modules[contractName] = dappPathConfig;
											modules = JSON.stringify(modules, false, 4);

											fs.writeFile(path.join('.', 'modules.full.json'), modules, 'utf8', function (err) {
												if (err) {
													return console.log(err);
												}

												console.log("Done");
											});
										});
									}
								});
							});
						});
					});
				} else if (options.delete) {
					inquirer.prompt([
						{
							type: "input",
							name: "filename",
							message: "Contract file name (without .js)"
						}
					], function (result) {
						var name = result.filename,
							type = filenames.length + 1,
							filename = result.filename + ".js";

						// проверяем что контракт существуем
						// удаляем
						// удаляем из modules.full.json
						var contractPath = path.join(contractsPath, filename);
						fs.exists(contractPath, function (exists) {
							if (exists) {
								fs.unlink(contractPath, function (err) {
									if (err) {
										return console.log(err);
									}

									console.log("Contract removed");

									console.log("Update list of contracts");

									fs.readFile(path.join('.', 'modules.full.json'), 'utf8', function (err, text) {
										if (err) {
											return console.log(err);
										}

										try {
											var modules = JSON.parse(text);
										} catch (e) {
											return console.log(e);
										}

										var name = "contracts/" + name;

										delete modules[name];
										modules = JSON.stringify(modules, false, 4);

										fs.writeFile(path.join('.', 'modules.full.json'), modules, 'utf8', function (err) {
											if (err) {
												return console.log(err);
											}

											console.log("Done");
										});
									});
								});
							} else {
								return console.log("Contract not found: " + contractPath);
							}
						});
					});
				} else {

				}
			} else {
				return console.log('./modules/contracts path not found, please, go to dapp folder');
			}
		});
	});

program
	.command('crypto')
	.description("crypto operations")
	.option('-p, --pubkey', "Generate public key by secret")
	.option('-g, --generate', "Generate random accounts")
	.action(function (options) {
		if (options.pubkey) {
			inquirer.prompt([
				{
					type: "password",
					name: "secret",
					message: "Put secret of your testnet account",
					validate: function (value) {
						var done = this.async();

						if (value.length == 0) {
							done("Secret must contain minimum 1 character");
							return;
						}

						if (value.length > 100) {
							done("Secret max length is 100 characters");
							return;
						}

						done(true);
					}
				}
			], function (result) {
				var account = accountHelper.account(result.secret);
				console.log("Public key: " + account.keypair.publicKey);
			});
		} else if (options.generate) {
			inquirer.prompt([
				{
					type: "input",
					name: "amount",
					message: "How many accounts generate",
					validate: function (value) {
						var num = parseInt(value);
						return !isNaN(num);
					}
				}
			], function (result) {
				var n = parseInt(result.amount),
					accounts = [];

				for (var i = 0; i < n; i++) {
					var a = accountHelper.account(cryptoLib.randomString(32));
					accounts.push({
						address: a.address,
						secret: a.secret,
						publicKey: a.keypair.publicKey
					});
				}

				console.log(accounts);
				console.log("Done");
			});
		} else {
			console.log("'node crypto -h' to get help");
		}
	});


if (!process.argv.slice(2).length) {
	program.outputHelp();
}

program.parse(process.argv);
