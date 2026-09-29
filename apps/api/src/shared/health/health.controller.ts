import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** Liveness + database readiness. */
  @Get()
  async health(): Promise<{ status: 'ok'; database: 'up' | 'down'; time: string }> {
    let database: 'up' | 'down' = 'up';
    try {
      await this.ds.query('SELECT 1');
    } catch {
      database = 'down';
    }
    return { status: 'ok', database, time: new Date().toISOString() };
  }
}
