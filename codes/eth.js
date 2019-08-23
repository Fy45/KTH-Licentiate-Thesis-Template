const Eth = require('web3')
const util = require("util")
const crypto = require('crypto')
const assertEqualBN = require('./helper/assert')
const htlcArrayToObj = require('./helper/utils')
const HDWalletProvider = require("truffle-hdwallet-provider")
const MY_SECRET_MNEMONIC = "cycle little able wish run zoo ethics twenty switch lava magnet jungle";
const env_api = "https://ropsten.infura.io/10347709826848a9a4347a1be1d02aa8";
const HTLC_abi = require('../build/contracts/HashedTimelock')
const HTLC_contract_address = '0x243785f6b65418191ea20b45fde7069ffe4f8cef'

let provider = new HDWalletProvider(MY_SECRET_MNEMONIC, env_api,0,10);
const web3 = new Eth(provider);


  /*
   * the function connectAcc() and getAcc() aim to 
   * connect to ropsten testnet using metamask account info
   * and get the send/receive account as desired
   * the first account id is 0
   * the commented line are meant for other users
   * till now is test only
   */

// async function connectAcc(mnemonic, api_key, id) {
//   MY_SECRET_MNEMONIC = mnemonic;
//   env_api = api_key;
//   provider = new HDWalletProvider(MY_SECRET_MNEMONIC, env_api);
//   const web3 = new Eth(provider);
//   web3.eth.getAccounts().then( function(e) => {
//     getAcc(e,id);
//   });
// }


async function connectAcc(id) {

  let  account = await web3.eth.getAccounts();
  address = account[id];
  return address;
  
}

const sha256 = x =>
  crypto
    .createHash('sha256')
    .update(x)
    .digest()
const txLoggedArgs = txReceipt => txReceipt.events.LogHTLCNew.returnValues
const txContractId = txReceipt => txLoggedArgs(txReceipt).contractId
const nowSeconds = () => Math.floor(Date.now() / 1000)
const getBalance = async (address) => web3.utils.toBN(await web3.eth.getBalance(address))
const txGas = (txReceipt, gasPrice = defaultGasPrice) => web3.utils.toBN(txReceipt.gasUsed * gasPrice)
const isSha256Hash = hashStr => /^0x[0-9a-f]{64}$/i.test(hashStr)



async function deployHTLC(sender, recipient, hash, time_lock, amount) {
  const htlc = new web3.eth.Contract(HTLC_abi, HTLC_contract_address)
  console.log('Deploying...');

  const timeLock = nowSeconds() + parseInt(time_lock)

  if (amount == 0){
    throw 'expected failure due to 0 value transferred'
  } 
  if (timeLock == nowSeconds()-1){
    throw 'expected failure due to past timelock'
  }
  let amountWei = web3.utils.toWei(amount.toString(),'ether')

  const txReceipt = await htlc.methods.newContract(
    recipient,
    hash,
    timeLock
  ).send(
       {
      from: sender,
      value: amountWei,
      gas: 3000000
    }
)

  
  const logArgs = txLoggedArgs(txReceipt)
  const contractId = logArgs.contractId
  assert(isSha256Hash(contractId))

  assert.equal(logArgs.sender, sender)
  assert.equal(logArgs.receiver, recipient)
  assertEqualBN(logArgs.amount, amountWei)
  assert.equal(logArgs.hashlock, hash)
  assert.equal(logArgs.timelock, timeLock)


  const contractArr = await htlc.methods.getContract(contractId).call()
  const contract = htlcArrayToObj(contractArr)
  assert.equal(contract.sender, sender)
  assert.equal(contract.receiver, recipient)
  assertEqualBN(contract.amount, amountWei)
  assert.equal(contract.hashlock, hash)
  assert.equal(Number(contract.timelock), timeLock)
  assert.isFalse(contract.withdrawn)
  assert.isFalse(contract.refunded)
  assert.equal(
    contract.preimage,
    '0x0000000000000000000000000000000000000000000000000000000000000000'
  )

  console.log("ETH HashTimelockContract was successfully created!");
  return contractId;

}

async function verifyHTLC(contractId) {
  const htlc = new web3.eth.Contract(HTLC_abi, HTLC_contract_address)

  const contractArr = await htlc.methods.getContract(contractId).call()
  const contract = htlcArrayToObj(contractArr)
  
  const hashSecret = contract.hashlock
  const Receiver = contract.receiver
  const Amount = contract.amount
  let unlockTime = Number(contract.timelock)
  unlockTime = new Date(unlockTime * 1000)
  console.log(`Sender          | ${contract.sender}`);
  console.log(`Reciever        | ${Receiver}`);
  console.log(`Transfer amount | ${Amount} Wei`);
  console.log(`Hash value      | ${hashSecret}`)
  console.log(`Unlock time     | ${unlockTime} (~ ${Math.max(0, Math.floor((Number(contract.timelock)-nowSeconds())/60))} mins)`)

  return hashSecret

}


async function resolveHTLC(receiver, contractId, secret) {
  const htlc = new web3.eth.Contract(HTLC_abi, HTLC_contract_address)


  let contractArr = await htlc.methods.getContract(contractId).call()
  let contract = htlcArrayToObj(contractArr)
  
  const hashSecret = contract.hashlock
  const Receiver = contract.receiver
  const amount = web3.utils.toBN(contract.amount)
  let unlockTime = Number(contract.timelock)
  timelock = new Date(unlockTime * 1000)

  const hashlock = sha256(web3.utils.hexToAscii(secret));
  const hashlock_bytes32 = '0x' + Buffer.from(hashlock).toString('hex')


  if (hashlock_bytes32 != hashSecret){
    throw 'expected failure due to wrong secret!'
  }
  if (receiver != Receiver){
    throw 'expected failure due to wrong receiver'
  }
  if (Math.floor(timelock-Date.now()) <=0){
    throw 'expected failure due to withdraw after timelock expired'
  }

  
  const receiverBalanceBefore = await getBalance(receiver)
  const withdrawTx = await htlc.methods.withdraw(contractId,secret).send({from:receiver, gas:3000000})
  const tx = await web3.eth.getTransaction(withdrawTx.transactionHash)


  // Check contract funds are now at the receiver address

  const expectedBalance = receiverBalanceBefore
                              .add(amount)
                              .sub(txGas(withdrawTx, tx.gasPrice))
  assertEqualBN(
    await getBalance(receiver),
    expectedBalance,
    "receiver balance doesn't match"
    )

  // get contract once more with updated info
  contractArr = await htlc.methods.getContract(contractId).call()
  contract = htlcArrayToObj(contractArr)
  assert.isTrue(contract.withdrawn) // withdrawn set
  assert.isFalse(contract.refunded) // refunded still false
  assert.equal(contract.preimage, secret)

  let actualBalance = await getBalance(receiver)
  actualBalance = web3.utils.fromWei(actualBalance,'ether')
  console.log("ETH HashTimelockContract was successfully redeemed!");
  console.log(`Account: ${receiver} has balance of ${actualBalance} ETH`);

}




async function waitForHTLC(contractId) {
  const htlc = new web3.eth.Contract(HTLC_abi, HTLC_contract_address)


  return new Promise((resolve, reject) => {
    const poll = setInterval(async function() {
        const contractArr = await htlc.methods.getContract(contractId).call()
        const contract = htlcArrayToObj(contractArr)
        const unlockTime = Number(contract.timelock)
        const secret = contract.preimage
        const block = await web3.eth.getBlock('latest')
        if (secret !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
        clearInterval(poll)
        btsSecret = web3.utils.hexToAscii(secret)
        resolve(btsSecret)
      } else if (block.timestamp > unlockTime) {
        clearInterval(poll)
        reject('ETH HTLC timed out')
      }
    }, 5e3)
  })
}




async function refundHTLC(sender, contractId) {
  const htlc = new web3.eth.Contract(HTLC_abi, HTLC_contract_address)

  let contractArr = await htlc.methods.getContract(contractId).call()
  let contract = htlcArrayToObj(contractArr)
  const amount = web3.utils.toBN(contract.amount)
  const timelock = Number(contract.timelock)
  if(nowSeconds() < timelock){
    throw 'expected failure due to timelock'
  }

  
  const senderBalanceBefore = await getBalance(sender)
  const refundTx = await htlc.methods.refund(contractId).send({
    from: sender,
    gas: 3000000
  })
  const tx = await web3.eth.getTransaction(refundTx.transactionHash)
  const expectedBalance = senderBalanceBefore
                                  .add(amount)
                                  .sub(txGas(refundTx, tx.gasPrice))
          assertEqualBN(
            await getBalance(sender),
            expectedBalance,
            "sender balance doesn't match"
          )
          contractArr = await htlc.methods.getContract(contractId).call()
          contract = htlcArrayToObj(contractArr)
          assert.isFalse(contract.withdrawn) // withdrawn still false
          assert.isTrue(contract.refunded) // refunded set

  let actualBalance = await getBalance(sender)
  actualBalance = web3.utils.fromWei(actualBalance,'ether')
  console.log("ETH HashTimelockContract was successfully refunded!");
  console.log(`Account: ${sender} has balance of ${actualBalance} ETH`);
}

module.exports = {
  connectAcc,
  deployHTLC,
  verifyHTLC,
  resolveHTLC,
  waitForHTLC,
  refundHTLC
}
