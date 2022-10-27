import {
  BlockDbAction,
  TxDbAction,
  AddressDbAction,
  BoxDbAction,
  DbTransaction,
  BoxContentDbAction,
} from '../db';
import { getNetworkType } from '../../util/network_type';
import { Node } from '../../util/network/node';
import { HeightRange, Err, TxDictionary, TokenData } from '../Types';
import { Paging } from '../../util/network/paging';
import Address from '../../db/entities/Address';
import { ErgoTx, ErgoBox, InputBox, Token } from '../../util/network/models';
import { Items } from '../../util/network/models';
import Tx from '../../db/entities/Tx';
import { Explorer } from '../../util/network/explorer';
import { TextRotationAngleupOutlined } from '@mui/icons-material';
import { validateBoxContentModel } from './../../store/asyncAction';

//constants
const LIMIT = 50;
const INITIAL_LIMIT = 10;

export class SyncTxs {
  private address: Address;
  networkType: string;
  node: Node;
  explorer: Explorer;

  constructor(address: Address, network_type: string) {
    this.networkType = network_type;
    this.address = address;
    this.node = getNetworkType(network_type).getNode();
    this.explorer = getNetworkType(address.network_type).getExplorer();
  }

  /**
   * insert boxes to the data base.
   * @param boxes : ErgoBox[]
   * @param tx : ErgoTx
   */
  insertBoxesToDB = async (boxes: ErgoBox[], tx: ErgoTx): Promise<void> => {
    const trx: Tx | null = await TxDbAction.getTxByTxId(
      tx.id,
      this.networkType
    );
    if (trx != null) {
      for (const box of boxes) {
        await BoxDbAction.createOrUpdateBox(box, this.address, trx, box.index);
      }
    } else {
      throw new Error('Transaction not found.');
    }
  };

  /**
   * spend input boxes of given transaction in db.
   * @param boxes : InputBox[]
   * @param tx : ErgoTx
   */
  spendBoxes = async (boxes: InputBox[], tx: ErgoTx) => {
    const trx: Tx | null = await TxDbAction.getTxByTxId(
      tx.id,
      this.networkType
    );
    if (trx != null) {
      for (const box of boxes)
        await BoxDbAction.spentBox(box.boxId, trx, box.index);
    } else {
      throw new Error('Transaction not found.');
    }
  };

  /**
   * save extracted trxs to db, insert unspent boxes and update spent boxes.
   * @param txs : TxDictionary
   * @param maxHeight : number
   */
  saveTxsToDB = async (txs: TxDictionary, maxHeight: number): Promise<void> => {
    const keyHeights = Object.keys(txs).map(Number);
    keyHeights.sort((k1, k2) => k1 - k2);

    for (const height of keyHeights) {
      if (height < maxHeight) {
        await TxDbAction.insertTxs(txs[height], this.networkType);

        for (const tx of txs[height]) {
          await this.insertBoxesToDB(tx.outputs, tx);
        }

        for (const tx of txs[height]) {
          await this.spendBoxes(tx.inputs, tx);
        }
      }
    }
    validateBoxContentModel();
  };

  /**
   * check blockIds of received trxs and compare them with blckIds stored in database.
   * @param txDictionary: TxDictionary
   */
  checkTrxValidation = async (txDictionary: TxDictionary): Promise<void> => {
    const dbHeaders = await BlockDbAction.getAllHeaders(this.networkType);
    for (const height in txDictionary) {
      txDictionary[height].forEach((txHeader) => {
        const foundHeader = dbHeaders.find(
          (dbHeader) => dbHeader.height == txHeader.inclusionHeight
        );
        if (foundHeader == undefined) return;
        else if (txHeader.blockId != foundHeader.id.toString()) {
          throw {
            message: 'blockIds not matched.',
            data: txHeader.inclusionHeight - 1,
          };
        }
      });
    }
  };

  /**
   * sort ErgoTxs and return a dictionary mapping each number k in txs' heightRange to array of txs with inclusionHeight == k
   * @param txs: ErgoTx[]
   * @returns TxDictionary
   */
  sortTxs = (txs: ErgoTx[]): TxDictionary => {
    const sortedTxs: TxDictionary = {};
    txs.forEach((tx) => {
      if (sortedTxs[tx.inclusionHeight] == undefined) {
        sortedTxs[tx.inclusionHeight] = [tx];
      } else {
        sortedTxs[tx.inclusionHeight] =
          sortedTxs[tx.inclusionHeight].concat(tx);
      }
    });
    return sortedTxs;
  };

  /**
   * get transactions for specific address, check if they're valid and store them.
   * @param currentHeight : number
   */
  syncTrxsWithAddress = async (currentHeight: number) => {
    const lastHeight: number = await this.node.getHeight();
    const heightRange: HeightRange = {
      fromHeight: currentHeight,
      toHeight: currentHeight,
    };
    const paging: Paging = {
      limit: INITIAL_LIMIT,
      offset: 0,
    };
    while (heightRange.fromHeight <= lastHeight) {
      const Txs: ErgoTx[] = [];
      let pageTxs: Items<ErgoTx> | undefined = undefined;
      while (pageTxs == undefined || pageTxs.items.length != 0) {
        pageTxs = await this.explorer.getTxsByAddressInHeightRange(
          this.address.address,
          heightRange,
          paging,
          true
        );
        Txs.concat(pageTxs.items);
        paging.offset += paging.limit;
      }

      const sortedTxs = this.sortTxs(Txs);
      try {
        this.checkTrxValidation(sortedTxs);
        await this.saveTxsToDB(sortedTxs, heightRange.toHeight);
        AddressDbAction.setAddressHeight(this.address.id, heightRange.toHeight);
      } catch (err: unknown) {
        const e = err as Err;
        const ProcessedHeight = e.data;
        await this.saveTxsToDB(sortedTxs, ProcessedHeight);
        AddressDbAction.setAddressHeight(this.address.id, ProcessedHeight);
        throw new Error('Fork happened.');
      }

      heightRange.fromHeight = heightRange.toHeight;
      heightRange.toHeight = Math.min(lastHeight, heightRange.toHeight + LIMIT);
      paging.offset = 0;
    }
  };

  verifyContent = async (): Promise<boolean> => {
    const expected = await this.explorer.getConfirmedBalanceByAddress(
      this.address.address
    );
    return (
      (await this.verifyTokens(expected.tokens)) &&
      (await this.verifyTotalErg(expected.nanoErgs))
    );
  };

  /**
   * compare dbTokens of the address with expectedTokens given from explorer.
   * @param expectedTokens : Token[]
   * @returns
   */
  verifyTokens = async (expectedTokens: Token[]): Promise<boolean> => {
    const dbTokens: TokenData[] = await BoxContentDbAction.getAddressTokens(
      this.address.id
    );

    const isSameToken = (a: TokenData, b: Token) =>
      a.tokenId === b.tokenId && a.total === b.amount;
    const diff1 = dbTokens.filter(
      (dbToken) =>
        !expectedTokens.some((expectedToken) =>
          isSameToken(dbToken, expectedToken)
        )
    );

    const diff2 = expectedTokens.filter(
      (expectedToken) =>
        !dbTokens.some((dbToken) => isSameToken(dbToken, expectedToken))
    );

    return diff1.length == 0 && diff2.length == 0;
  };

  verifyTotalErg = async (expectedTotalErg: bigint) => {
    const totalDbErg = await AddressDbAction.getAddressTotalErg(
      this.address.id
    );
    return totalDbErg?.erg_str == expectedTotalErg;
  };
}
