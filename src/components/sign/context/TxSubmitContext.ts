import * as wasm from 'ergo-lib-wasm-browser';
import { createContext } from 'react';

interface TxSubmitContextType {
  submit: (signed: wasm.Transaction) => unknown;
}

const TxSubmitContext = createContext<TxSubmitContextType>({
  submit: () => null,
});

export default TxSubmitContext;
