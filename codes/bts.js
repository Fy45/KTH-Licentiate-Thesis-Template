const Apis = require('bitsharesjs-ws').Apis;
const TransactionBuilder = require('bitsharesjs').TransactionBuilder;
const ChainStore = require('bitsharesjs').ChainStore;
const FetchChain = require('bitsharesjs').FetchChain;
const PrivateKey = require('bitsharesjs').PrivateKey;
const hash = require('bitsharesjs').hash;
//const btsForEth = require('./btsForEth') is wrong, we are not allowed to circular dependency


/*
 * Here we need to specify the rpc_endpoint_url since I am using the local private testnet
 * you can change to your own network ws address
 * Keep the both side private key to perform the signature generate
 * could be update to input parameters.
 */

const rpc_endpoint_url = "ws://127.0.0.1:8090";
var sprivKey = "5Kecd9SoyHEYbSrUnadGzSokptuTWNMKi4M4CgXh7dSNSzLkNLq";
let spKey = PrivateKey.fromWif(sprivKey);
var rprivKey = "5Hwv9FXXrMd4o3FaHFJRLwuMmsihLz29bAGQYon4arK6ZzXCQhB";
let rpKey = PrivateKey.fromWif(rprivKey);
Apis.instance(rpc_endpoint_url, true).init_promise.then(
	res => {
		console.log("Successfully connected to BTS local test network.")
		return ChainStore.init(false);
	});

/* 
 * Instance the connection using the api
 * since I use the local private testnet the network_name is not defined
 * script adopted from bitsharesjs/examples/createHtlc.js
 * check your environment before use
 */


async function deployHTLC(sender, recipient, Hash, amount, timelock, secret) {

	let fromAccount = sender;
	let toAccount = recipient;

	let time_lock = parseInt(timelock);
	let hash = Hash;

	return Promise.all([
		ChainStore.FetchChain("getAccount", fromAccount),
		ChainStore.FetchChain("getAccount", toAccount)
	]).then(res => {

		let [fromAccount, toAccount] = res;

		let tr = new TransactionBuilder();

		let preimageValue = secret;
		let preimage_hash_calculated = hash;

		let operationJSON = {
			from: fromAccount.get("id"),
			to: toAccount.get("id"),
			fee: {
				amount: 0,
				asset_id: "1.3.0"
			},
			amount: {
				amount: amount,
				asset_id: "1.3.0"
			},
			preimage_hash: [2, preimage_hash_calculated],
			preimage_size: preimageValue.length,
			claim_period_seconds: time_lock
		};

		tr.add_type_operation("htlc_create", operationJSON);

		return tr.set_required_fees().then(() => {

			tr.add_signer(spKey, spKey.toPublicKey().toPublicKeyString());

			return tr

				.broadcast()
				.then(result => {
					console.log(
						"BTS HashTimelockContract was successfully created!");
					let htlcResponse = result[0].trx.operation_results[0];
					let htlc_id = htlcResponse[1]
					return htlc_id
				})
				.catch(error => {
					console.error(error);
				});
		});
	});
};


async function verifyHTLC(htlc_id) {

	let id = htlc_id;

	return Promise.all([
		ChainStore.FetchChain("getObject", id)
	]).then(result => {

		const res = JSON.parse(JSON.stringify(result))
		const htlcId = res[0].id
		const fromAccountId = res[0].transfer.from
		const toAccountId = res[0].transfer.to
		const amount = res[0].transfer.amount
		const hash = '0x' + res[0].conditions.hash_lock.preimage_hash[1]
		const time_lock = res[0].conditions.time_lock.expiration


		console.log(`From Account id         | ${fromAccountId}`);
		console.log(`To Account id           | ${toAccountId}`);
		console.log(`Transaction amount      | ${amount} BTS`);
		console.log(`Hash value              | ${hash}`);
		console.log(`Expiration time         | ${time_lock}`);

		return hash

	});


}



async function resolveHTLC(Htlcid, Recipient, secret) {

	let toAccount = Recipient;
	return Promise.all(
		[FetchChain("getAccount", toAccount)]).then(res => {

		let [toAccount] = res;

		let tr = new TransactionBuilder();

		let preimageValue = secret;

		let operationJSON = {

			preimage: new Buffer.from(preimageValue).toString("hex"),
			fee: {
				amount: 0,
				asset_id: "1.3.0"
			},
			htlc_id: Htlcid,
			redeemer: toAccount.get("id"),
			extensions: null
		};


		tr.add_type_operation("htlc_redeem", operationJSON);

		return tr.set_required_fees().then(() => {

			tr.add_signer(rpKey, rpKey.toPublicKey().toPublicKeyString());


			return tr
				.broadcast()
				.then(result => {
					let balance = ChainStore.getAccountBalance(toAccount,"1.3.0")
					balance = balance/100000
					return `BTS HashTimelockContract was successfully redeemed at : ${Date()} \nAccount Balance is ${balance} BTS`

				})
				.catch(err => {
					console.error(err);
				});
		});

	});
};

/*
 * Bitshares blockchain doesn't provide refund function
 * but allows sender to extend the contract expiration time as he/she wants
 * Taking transactionBuilder test code function as example
 */

async function extendHTLC(sender, id, seconds) {
	let fromAccount = sender;

	return Promise.all([
		FetchChain("getAccount", fromAccount)
	]).then(res => {
		let [fromAccount] = res;

		let tr = new TransactionBuilder();
		let Htlc_id = id;
		let extend_time = parseInt(seconds);

		let operationJSON = {
			fee: {
				amount: 0,
				asset_id: "1.3.0"
			},
			htlc_id: Htlc_id,
			update_issuer: fromAccount.get("id"),
			seconds_to_add: extend_time,
			extensions: null
		};


		tr.add_type_operation("htlc_extend", operationJSON);

		return tr.set_required_fees().then(() => {
			tr.add_signer(spKey, spKey.toPublicKey().toPublicKeyString());



			return tr
				.broadcast()
				.then(result => {
					const reply = result[0].trx.expiration;
					return "BTS HashTimelockContract was successfully extended! \nPlease redeem the contract before: " + reply

				})
				.catch(err => {
					console.error(err);
				});

		});
	});
};



module.exports = {
	deployHTLC,
	verifyHTLC,
	resolveHTLC,
	extendHTLC
};