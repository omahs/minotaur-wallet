import React from 'react';
import { useSelector } from 'react-redux';
import { DisplayType } from '@/store/reducer/config';
import { GlobalStateType } from '@/store';

interface InSimpleModePropsType {
  children?: React.ReactNode;
  display: DisplayType;
}

const InSimpleMode = (props: InSimpleModePropsType) => {
  const display: string = useSelector(
    (state: GlobalStateType) => state.config.display,
  );
  return (
    <React.Fragment>
      {display === 'simple' ? props.children : null}
    </React.Fragment>
  );
};

export default InSimpleMode;
