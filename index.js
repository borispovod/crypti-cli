var inquirer = require("inquirer");
var program = require('commander');
var accountHelper = require('./helpers/account.js');
var blockHelper = require('./helpers/block.js');
var dappHelper = require('./helpers/dapp.js');
var gift = require('gift');
var fs = require('fs');
var path = require('path');
var rmdir = require('rmdir');
var toolkit = "git@github.com:crypti/testdapp.git";

program.version('0.0.1');

program
	.command("dapps")
	.description("Manage your dapps")
	.option("-a, --add", "Add dapp")
	.option("-c, --change", "Change dapp genesis block")
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
									genesisBlock = require('./genesisBlock.js');
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
										type: "confirm",
										name: "confirmed",
										message: "Do you want to add dapp"
									}
								], function (result) {
									if (!result.confirmed) {
										console.log("Save genesis blocks");
										var genesisBlockJson = JSON.stringify(block, null, 4);

										try {
											fs.writeFileSync(path.join('.', 'genesisBlock.js'), 'module.exports = ', "utf8");
											fs.appendFileSync(path.join('.', 'genesisBlock.js'), genesisBlockJson, "utf8");
										} catch (e) {
											return console.log(err);
										}

										if (newGenesisBlock) {
											console.log("Update config");

											var config = require('./config.json');
											config.forging = config.forging || {};
											config.forging.secret = delegates.map(function (d) {
												return d.secret;
											});

											fs.writeFile(path.join('.', 'config.json'), JSON.stringify(config, null, 2), function (err) {
												if (err) {
													console.log(err);
												} else {
													console.log("Done");
												}
											});
										} else {
											console.log("Done");
										}
									} else {
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

																console.log("Save genesis blocks");
																var genesisBlockJson = JSON.stringify(block, null, 4);

																try {
																	fs.writeFileSync(path.join('.', 'genesisBlock.js'), 'module.exports = ', "utf8");
																	fs.appendFileSync(path.join('.', 'genesisBlock.js'), genesisBlockJson, "utf8");
																} catch (e) {
																	return console.log(err);
																}

																var dappGenesisBlockJson = JSON.stringify(dappBlock, null, 4);

																try {
																	fs.writeFileSync(path.join(dappPath, 'genesis.json'), dappGenesisBlockJson, "utf8");
																} catch (e) {
																	return console.log(err);
																}

																if (newGenesisBlock) {
																	console.log("Update config");

																	var config = require('./config.json');
																	config.forging = config.forging || {};
																	config.forging.secret = delegates.map(function (d) {
																		return d.secret;
																	});

																	fs.writeFile(path.join('.', 'config.json'), JSON.stringify(config, null, 2), function (err) {
																		if (err) {
																			console.log(err);
																		} else {
																			console.log("Done");
																		}
																	});
																} else {
																	console.log("Done");
																}
															});
														});
													});
												});
											});

										});
									}
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
		} else {
			console.log("'node dapps -h' to get help");
		}
	});

program
	.command('contract')
	.description('contract operations')
	.option('-a, -add', "Add new contract")
	.action(function (options) {
		fs.exists('./contracts', function (exist) {
			if (exist) {
				fs.readdir('./contracts', function (filenames) {
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

						fs.readFile("./contract-example.js", "utf8", function (exampleContract) {
							exampleContract = exampleContract.replace("ExampleContract", name);
							exampleContract = exampleContract.replace("//self.type = null;", "self.type = " + type);

							js.writeFile("./contracts/" + filename, exampleContract, "utf8", function (err) {
								if (err) {
									return console.log(err);
								} else {
									console.log("New contract created: " + ("./contracts/" + filename));
								}
 							});
						});
					});
				});

			} else {
				return console.log('./contracts path not found, please, go to dapp folder');
			}
		});
	});

program
	.command('crypto')
	.description("crypto operations")
	.option('-p, --pubkey', "Generate public key by secret")
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
		} else {
			console.log("'node crypto -h' to get help");
		}
	});


if (!process.argv.slice(1).length) {
	program.outputHelp();
}

program.parse(process.argv);
