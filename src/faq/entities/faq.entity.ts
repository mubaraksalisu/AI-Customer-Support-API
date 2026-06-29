import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity()
export class Faq {
  @PrimaryGeneratedColumn()
  id: number;

  @Column('text')
  question: string;

  @Column('text')
  answer: string;

  @Column({ type: 'text', nullable: true })
  embedding: string; // stored as stringified array, converted on use
}
