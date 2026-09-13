import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Player } from '../player/player.entity.js';

@Entity({ name: 'auth' })
export class Auth {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'player_id', type: 'uuid' })
  playerId: string;

  @OneToOne(() => Player, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'player_id' })
  player: Player;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({ name: 'avatar_url', type: 'text' })
  avatarUrl: string;

  @Column({ name: 'avatar_full_url', type: 'text' })
  avatarFullUrl: string;

  @Column({ name: 'profile_url', type: 'text' })
  profileUrl: string;

  @Column({ name: 'last_login_at', type: 'timestamp', precision: 3 })
  lastLoginAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp', precision: 3 })
  updatedAt: Date;
}
