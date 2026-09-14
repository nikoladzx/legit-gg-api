import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';

import { Player } from '../player/player.entity.js';

@Entity({ name: 'leetify_stats' })
@Unique('UQ_leetify_stats_match_player', ['matchId', 'steamId'])
export class LeetifyStat {
  @PrimaryColumn('uuid', { default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'match_id', type: 'uuid' })
  matchId: string;

  @Index('IDX_leetify_stats_steam_id')
  @Column({ name: 'steam_id', type: 'text' })
  steamId: string;

  @ManyToOne(() => Player, {
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE',
    nullable: false,
  })
  @JoinColumn({ name: 'steam_id', referencedColumnName: 'steamId' })
  player: Player;

  @Column({ name: 'pre_aim', type: 'double precision', nullable: true })
  preAim: number | null;

  @Column({ name: 'reaction_time', type: 'double precision', nullable: true })
  reactionTime: number | null;

  @Column({ type: 'double precision', nullable: true })
  accuracy: number | null;

  @Column({
    name: 'accuracy_enemy_spotted',
    type: 'double precision',
    nullable: true,
  })
  accuracyEnemySpotted: number | null;

  @Column({ name: 'accuracy_head', type: 'double precision', nullable: true })
  accuracyHead: number | null;

  @Column({ name: 'leetify_rating', type: 'double precision', nullable: true })
  leetifyRating: number | null;

  @Column({ name: 'last_updated', type: 'timestamp', precision: 3 })
  lastUpdated: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp', precision: 3 })
  createdAt: Date;
}
