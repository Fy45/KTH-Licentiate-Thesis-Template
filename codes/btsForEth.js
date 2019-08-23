const hash = require('bitsharesjs').hash;
const bts = require('./bts')
const eth = require('./eth')
const prompt = require('./helper/prompt')
const web3 = require('web3')


async function btsForEth() {


  // configure the BTS party (both side)
  let btsSender = await prompt('Enter BTS account name of sender: ')
  let btsRecipient = await prompt('Enter BTS account name of recipient: ')
  let value = await prompt('Enter BTS amount to send: ')
  console.log("To log contract uniformly, \nwe highly recommended generating secret should be no shorter than 32!");
  let secret = await prompt('Enter the preimage value you generate: ')
  let time_lock = await prompt('Enter the time you want to lock in contract (seconds): ')



  /* 
   * selling BTS buying ETH,
   * generate the htlc contract on BTS side
   */
  value = parseFloat(value);
  let hash_lock = hash.sha256(secret);
  console.log("Deploying...");
  const btsHtlcid = await bts.deployHTLC(btsSender, btsRecipient, hash_lock, value, time_lock, secret)
  hash_lock = '0x' + Buffer.from(hash_lock).toString('hex')
  console.log(`Please inform your counterparty with the hash value: ${hash_lock}`);
  console.log(`and BTS HTLC id ${btsHtlcid}`)


  /* 
   * configure the ETH party(receiver)
   * the comment code is use for other user,
   * since it involves important values in MetaMask wallet
   * for now it's only test locally
   */

  //let mnemonic = await prompt('Enter the secret mnemonics to get access to your metamask wallet: ')
  //let api_key = await prompt('Also specify your ropsten infrua api_key: ')
  //const ethRecipient = eth.connectAcc(mnemonic, api_key, id)

  let id = await prompt('Enter your recipient account id of ETH wallet: ')
  const ethRecipient = await eth.connectAcc(id);
  console.log(`Ropsten ETH wallet address: ${ethRecipient}`);

  /*
   * Verify the contract
   */
  const ethHtlcId = await prompt('Enter the ETH HTLC id: ')
  console.log('\nETH HTLC:');
  const ethHashSecret = await eth.verifyHTLC(ethHtlcId)
  if (hash_lock !== ethHashSecret) {
    throw "Hashes don't match"
  }


  /*
   * Redeem the BTS contract
   * or refund ETH after time expires
   * transaction complete
   */
  console.log(`Enter yes if you want to redeem the agreed amount of ETH from contract: \n${ethHtlcId} \nOr enter exit if you want to quit: `);
  let answer = await prompt('> ')
  switch (answer) {
    case 'yes':
      console.log('Resolving ETH HTLC...');
      await eth.resolveHTLC(ethRecipient, ethHtlcId, web3.utils.asciiToHex(secret))
      break
    case 'exit':
      console.log('Exiting...');
      break

  }


}



module.exports = btsForEth