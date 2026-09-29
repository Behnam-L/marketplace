import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_CONFIG, type AppConfig } from '../../config/config.module';
import { FileObject } from './file-object.entity';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FILE_STORAGE, LocalDiskStorage, MALWARE_SCANNER, MockMalwareScanner } from './file-storage';

@Module({
  imports: [TypeOrmModule.forFeature([FileObject])],
  controllers: [FilesController],
  providers: [
    FilesService,
    { provide: FILE_STORAGE, inject: [APP_CONFIG], useFactory: (c: AppConfig) => new LocalDiskStorage(c.fileStorageDir) },
    { provide: MALWARE_SCANNER, useClass: MockMalwareScanner },
  ],
  exports: [FilesService],
})
export class FilesModule {}
