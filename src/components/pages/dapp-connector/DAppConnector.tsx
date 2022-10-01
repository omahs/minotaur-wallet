import React from 'react';
import {
  ActionType,
  AddressRequestPayload,
  BalanceRequestPayload,
  Connection,
  ConnectionData,
  ConnectionState,
  MessageContent,
  MessageData,
  Payload,
} from './types';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Container,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';
import Typography from '@mui/material/Typography';
import WalletSelect from './WalletSelect';
import WalletWithErg from '../../../db/entities/views/WalletWithErg';
import * as CryptoJS from 'crypto-js';
import {
  AddressDbAction,
  BoxContentDbAction,
  BoxDbAction,
  WalletDbAction,
} from '../../../action/db';

interface DAppConnectorPropType {
  value: string;
  clearValue: () => any;
}

interface DAppConnectorStateType {
  servers: { [url: string]: Connection };
  connections: Array<ConnectionState>;
  active: string;
}

class DAppConnector extends React.Component<
  DAppConnectorPropType,
  DAppConnectorStateType
> {
  state: DAppConnectorStateType = {
    servers: {},
    connections: [],
    active: '31b2a127-c028-4fa7-b167-68b60d21619f',
  };

  decrypt = (text: string, secret: string) => {
    const bytes = CryptoJS.AES.decrypt(text, secret);
    return bytes.toString(CryptoJS.enc.Utf8);
  };

  encrypt = (text: string, secret: string) => {
    return CryptoJS.AES.encrypt(text, secret).toString();
  };

  handleError = (error: Event) => {};

  componentDidMount() {}

  processConfirmed = (connection: ConnectionState) => {
    this.setState((state) => {
      const newConnections = [...state.connections];
      const updatedConnections = newConnections.map((item) => {
        if (item.info.pageId === connection.info.pageId) {
          return { ...item, display: '' };
        }
        return item;
      });
      return { ...state, connections: updatedConnections };
    });
  };

  processAddress = async (
    connection: ConnectionState,
    content: MessageContent
  ) => {
    const payload = content.payload as AddressRequestPayload;
    const wallet = await WalletDbAction.getWalletById(connection.walletId!);
    if (wallet) {
      const addresses = await AddressDbAction.getWalletAddresses(wallet.id);
      let resultAddress: Array<string> = [];
      if (payload.type === 'change') {
        resultAddress = [addresses[0].address];
      } else {
        const usedAddressIds = (
          await BoxDbAction.getUsedAddressIds(`${wallet.id}`)
        ).map((item) => item.addressId);
        resultAddress = addresses
          .filter((item) => {
            const index = usedAddressIds.indexOf(item.id);
            return payload.type === 'used' ? index !== -1 : index === -1;
          })
          .map((item) => item.address);
        if (payload.page) {
          resultAddress = resultAddress.slice(
            payload.page.page * payload.page.limit,
            (payload.page.page + 1) * payload.page.limit
          );
        }
      }
      this.sendMessageToServer(
        connection,
        'address_response',
        content.requestId,
        resultAddress
      );
    }
  };

  processBalance = async (
    connection: ConnectionState,
    content: MessageContent
  ) => {
    const payload = content.payload as BalanceRequestPayload;
    const wallet = await WalletDbAction.getWalletWithErg(connection.walletId!);
    if (wallet) {
      const tokens = payload.tokens;
      const res: { [id: string]: string } = {};
      const amounts: { [id: string]: string } = {};
      (await BoxContentDbAction.getWalletTokens(wallet.id)).forEach((item) => {
        amounts[item.tokenId] = item.total;
      });
      tokens.forEach((token) => {
        if (token === 'ERG' || token === '') {
          res['ERG'] = wallet.erg().toString();
        } else {
          res[token] = amounts.hasOwnProperty(token) ? amounts[token] : '0';
        }
      });
      this.sendMessageToServer(
        connection,
        'balance_response',
        content.requestId,
        res
      );
    }
  };
  handleMessage = (msg: MessageData) => {
    const filteredConnections = this.state.connections.filter(
      (item) => item.info.pageId === msg.pageId
    );
    if (filteredConnections.length === 1) {
      const connection = filteredConnections[0];
      // const contentStr = this.decrypt(msg.content, connection.info.enc_key)
      const content: MessageContent = JSON.parse(msg.content);
      console.log(msg);
      switch (content.action) {
        case 'confirmed':
          this.processConfirmed(connection);
          break;
        case 'address_request':
          this.processAddress(connection, content).then(() => null);
          break;
        case 'balance_request':
          this.processBalance(connection, content).then(() => null);
      }
    }
  };

  sendMessageToServer = (
    connection: ConnectionState,
    action: ActionType,
    requestId: string,
    payload: Payload
  ) => {
    const serverAddress = connection.info.server;
    let server: Connection = this.state.servers[serverAddress];
    server.send(
      connection.info.id,
      connection.info.pageId,
      JSON.stringify({
        action: action,
        requestId: requestId,
        payload: payload,
      })
    );
  };

  sendConnectionToServer = (connection: ConnectionState) => {
    const serverAddress = connection.info.server;
    let server: Connection = this.state.servers.hasOwnProperty(serverAddress)
      ? this.state.servers[serverAddress]
      : new Connection(serverAddress, this.handleError, this.handleMessage);
    server.send(
      connection.info.id,
      connection.info.pageId,
      JSON.stringify({
        action: 'confirm',
        requestId: connection.info.requestId,
        payload: {
          id: server.getId(),
          display: connection.display,
        },
      })
    );
    if (!this.state.servers.hasOwnProperty(serverAddress)) {
      this.setState((state) => ({
        ...state,
        servers: {
          ...state.servers,
          [serverAddress]: server,
        },
      }));
    }
  };

  componentDidUpdate = () => {
    if (this.props.value) {
      const info: ConnectionData = JSON.parse(
        this.props.value
      ) as ConnectionData;
      const current = this.state.connections.filter(
        (item) => item.info.pageId === info.pageId
      );
      if (current.length === 0) {
        this.setState((state) => ({
          ...state,
          connections: [
            {
              info: info,
              actions: [],
              display: '' + Math.floor(Math.random() * 899999 + 100000),
            },
            ...state.connections,
          ],
          active: info.pageId,
        }));
      } else {
        this.setState({ active: info.pageId });
      }
      this.props.clearValue();
    }
  };

  selectWallet = (index: number, selected: WalletWithErg) => {
    this.setState((state) => {
      let newConnection = [...state.connections];
      newConnection[index] = { ...newConnection[index] };
      newConnection[index].walletId = selected.id;
      this.sendConnectionToServer(newConnection[index]);
      return {
        ...state,
        connections: newConnection,
      };
    });
    // TODO send connection accepted to port
  };

  render = () => {
    return (
      <Container style={{ marginTop: 10 }}>
        {this.state.connections.map((connection, index) => (
          <Accordion
            key={connection.info.pageId}
            expanded={this.state.active === connection.info.pageId}
            onChange={() => this.setState({ active: connection.info.pageId })}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography sx={{ width: '33%', flexShrink: 0 }}>
                <img
                  alt="fav-icon"
                  src={connection.info.favIcon}
                  style={{ width: 20, height: 20 }}
                />
              </Typography>
              <Typography sx={{ color: 'text.secondary' }}>
                {connection.info.origin}
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              {connection.walletId ? (
                connection.display ? (
                  <Typography align="center">
                    Please View this code on connector
                    <span
                      style={{
                        letterSpacing: 8,
                        display: 'block',
                        padding: 10,
                      }}
                    >
                      <span
                        style={{
                          background: '#CDCDCD',
                          padding: 5,
                          fontWeight: 'bold',
                          fontSize: 20,
                          borderRadius: 10,
                        }}
                      >
                        {connection.display}
                      </span>
                    </span>
                    and verify it to connection be completed
                  </Typography>
                ) : (
                  <div>wallet selected</div>
                )
              ) : (
                <WalletSelect
                  select={(selected: WalletWithErg) =>
                    this.selectWallet(index, selected)
                  }
                />
              )}
            </AccordionDetails>
          </Accordion>
        ))}
      </Container>
    );
  };
}

export default DAppConnector;
