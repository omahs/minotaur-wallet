import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

enum WalletType {
  ReadOnly = 'READ_ONLY',
  Normal = 'NORMAL',
  MultiSig = 'MULTI_SIG',
}

const WalletTypeLabel = {
  [WalletType.ReadOnly]: 'Read only Wallet',
  [WalletType.Normal]: 'Normal Wallet',
  [WalletType.MultiSig]: 'Multi Sig Wallet',
};

@Entity({ name: 'wallet' })
class Wallet {
  @PrimaryGeneratedColumn()
  id = 0;

  @Column('text')
  name = '';

  @Column('text')
  network_type = '';

  @Column('text')
  seed = '';

  @Column('text')
  extended_public_key = '';

  @Column('text')
  type: WalletType = WalletType.Normal;

  @Column('int', { nullable: true })
  required_sign = 1;

  @Column('int', { nullable: false, default: 1 })
  version = 1;
}

export default Wallet;

export { WalletType, WalletTypeLabel };
