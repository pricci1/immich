import { Injectable } from '@nestjs/common';
import { OnEvent } from 'src/decorators';
import { AlbumUserRole } from 'src/enum';
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

    const assetsToTransfer = assets.filter((asset) => asset.ownerId !== album.ownerId) || [];

    await this.transferAssetsOwnership(assetsToTransfer, album.ownerId);
  }

  @OnEvent({ name: 'album.invite' })
  async handleAlbumInvite({ id, userId: invitedUserId }: ArgOf<'album.invite'>) {
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

    const isAdminAlbumEditor = !!album.albumUsers.some(
      (user) => user.user.id === admin.id && user.role === AlbumUserRole.EDITOR,
    );

    if (album.ownerId === admin.id || invitedUserId !== admin.id || !isAdminAlbumEditor) {
      return;
    }

    await this.albumRepository.update(id, { ownerId: admin.id });
    // remove admin from album's users, since owners are already included
    await this.albumUserRepository.delete({ albumsId: id, usersId: admin.id });
    await this.albumUserRepository.create({ albumsId: id, usersId: album.ownerId, role: AlbumUserRole.EDITOR });
    // TODO transfer assets ownership

  private async transferAssetsOwnership(assets: any[], newOwnerId: string) {
    for (const asset of assets) {
      await this.assetRepository.update({
        id: asset.id,
        ownerId: newOwnerId,
      });

      this.logger.log(`Transferred ownership of asset ${asset.id} from ${asset.ownerId} to ${newOwnerId}`);

      const fileSize = asset.exifInfo?.fileSizeInByte || 0;
      if (fileSize > 0 && !asset.libraryId) {
        await this.userRepository.updateUsage(asset.ownerId, -fileSize);
        await this.userRepository.updateUsage(newOwnerId, fileSize);
      }
    }
  }
}
