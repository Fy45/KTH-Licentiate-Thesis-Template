const bts = require('./bts')
const eth = require('./eth')
const prompt = require('./helper/prompt')



async function ethForBts() {

  /* 
   * configure the ETH party(both side)
   * in this case we require the receiver side specify address
   * the comment code is use for other user,
   * since it involves important values in MetaMask wallet
   * for now it's only test locally
   */

  //let mnemonic = await prompt('Enter the secret mnemonics (12 words) to get access to your metamask wallet: ')
  //let api_key = await prompt('Also specify your ropsten infrua api_key: ')
  //const ethSender = eth.connectAcc(mnemonic, api_key, id)

  let id = await prompt('Enter your sender account id of ETH wallet(e.g. firstAcc is 0): ')
  let ethSender = await eth.connectAcc(id);
  console.log(`Ropsten ETH wallet address  ${ethSender}`);
  const ethRecipient = await prompt('Enter ETH address to receive funds: ')
  let ethAmount = await prompt('Enter the ETH you want to send: ')
  let hash_lock = await prompt('Enter the hash_value you got from BTS side: ')
  console.log("In order to protect your money, please lock the contract less time than BTS does...");
  let time_lock = await prompt('Enter the time you want to lock in contract (seconds): ')

  /* 
   * selling ETH buying BTS,
   * generate the htlc contract on ETH side
   */

  const ethHtlcId = await eth.deployHTLC(ethSender, ethRecipient, hash_lock, time_lock, ethAmount)
  console.log(`Please inform your counterparty with the ETH HTLC id ${ethHtlcId}`)
  const btsRecipient = await prompt('Enter your BTS account name: ')

  /* 
   * Verify the contract
   * check both HashSecret to see if they are match
   */
  const btsHtlcId = await prompt('Enter the BTS HTLC id: ')
  console.log('\nBTS HTLC:');
  const btsHashSecret = await bts.verifyHTLC(btsHtlcId)
  if (btsHashSecret !== hash_lock) {
    throw "Hashes don't match"
  }

  /*
   * Redeem the BTS contract
   * or refund ETH after time expires
   * transaction complete
   */
  console.log(`\nIf details are correct then input yes to redeem your BTS`);
  console.log(`Or else please enter exit and talk with your counter party: `);
  let answer = await prompt('> ')
  switch (answer) {
    case 'yes':
      console.log('Waiting for ETH contract to be resolved...');
      // complete the transaction
      await eth.waitForHTLC(ethHtlcId)
        .then(async function(secret) {
          console.log("Resolving BTS HTLC contract...");
          const output = await bts.resolveHTLC(btsHtlcId, btsRecipient, secret)
          console.log(output);
        })
        .catch(async function(err) {
          console.log(err);
          console.log('Refunding ETH...');
          await eth.refundHTLC(ethSender, ethHtlcId)
        })
      break

    case 'exit':
      console.log('Exiting...');
      break

  }

}

module.exports = ethForBts