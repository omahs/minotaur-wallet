import React from "react";
import Mnemonic from "./Mnemonic";
import AddressConfirm from "./AddressConfirm";
import { withRouter } from "react-router-dom";
import WalletCreate from "../WalletCreate";

class RestoreWallet extends WalletCreate {
    componentDidMount() {
        this.setState({ mnemonic: "nominee pretty fabric dance opinion lemon attend garden market rally bread own own material icon" });
        // this.setState({mnemonic: ''})
    }

    renderMnemonic = () => (
        <Mnemonic
            mnemonic={this.state.mnemonic}
            goBack={() => this.goBackName()}
            goForward={mnemonic => this.goConfirm(mnemonic)} />
    );
    renderConfirm = () => (
        <AddressConfirm
            mnemonic={this.state.mnemonic}
            password={this.state.mnemonicPassPhrase}
            goBack={() => this.setState({ step: 1 })}
            goForward={this.saveWallet} />
    );
}

export default withRouter(RestoreWallet);
