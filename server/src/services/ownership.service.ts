import { Injectable } from '@nestjs/common';
import { OnEvent } from 'src/decorators';
import { ArgOf } from 'src/repositories/event.repository';
import { BaseService } from 'src/services/base.service';

@Injectable()
export class OwnershipService extends BaseService {
  @OnEvent({ name: 'album.update' })
  async handleAlbumUpdate({ id }: ArgOf<'album.update'>) {
    const album = await this.albumRepository.getById(id, { withAssets: true });
    if (!album) {
      this.logger.warn(`Cannot find album ${id} for ownership transfer`);
      return;
    }

    const admin = await this.userRepository.getAdmin();

    if (!admin) {
      this.logger.warn(`Cannot find admin for ownership transfer`);
      return;
    }

    if (album.ownerId !== admin.id) {
      return;
    }

    const assets = album.assets;
    if (!assets || assets.length === 0) {
      return;
    }

    const assetsToTransfer = assets.filter((asset) => asset.ownerId !== album.ownerId);
    if (assetsToTransfer.length === 0) {
      return;
    }

    for (const asset of assetsToTransfer) {
      await this.assetRepository.update({
        id: asset.id,
        ownerId: album.ownerId,
      });

      this.logger.log(`Transferred ownership of asset ${asset.id} from ${asset.ownerId} to ${album.ownerId}`);

      const fileSize = asset.exifInfo?.fileSizeInByte || 0;
      if (fileSize > 0 && !asset.libraryId) {
        await this.userRepository.updateUsage(asset.ownerId, -fileSize);
        await this.userRepository.updateUsage(album.ownerId, fileSize);
      }
    }
  }
}
