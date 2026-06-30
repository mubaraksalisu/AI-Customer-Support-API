import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'order_number' })
  orderNumber: string;

  @Column({ name: 'customer_name' })
  customerName: string;

  @Column()
  status: string;

  @Column()
  item: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
