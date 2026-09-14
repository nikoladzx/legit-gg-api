import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'players' })
export class Player {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'steam_id', type: 'text', unique: true })
  steamId: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', precision: 3 })
  updatedAt: Date;

  @Index('IDX_players_last_checked_at')
  @Column({
    name: 'last_checked_at',
    type: 'timestamp',
    precision: 3,
    nullable: true,
  })
  lastCheckedAt: Date | null;
}
