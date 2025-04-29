import { AlbumUser } from 'src/database';
import { AlbumUserRole } from 'src/enum';
import { OwnershipService } from 'src/services/ownership.service';
import { albumStub } from 'test/fixtures/album.stub';
import { assetStub } from 'test/fixtures/asset.stub';
import { userStub } from 'test/fixtures/user.stub';
import { newTestService, ServiceMocks } from 'test/utils';

describe(OwnershipService.name, () => {
  let sut: OwnershipService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(OwnershipService));
  });

  it('should work', () => {
    expect(sut).toBeDefined();
  });

  describe('handleAlbumUpdate', () => {
    it('should skip if album is not found', async () => {
      mocks.album.getById.mockResolvedValue(void 0);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).not.toHaveBeenCalled();
      expect(mocks.asset.update).not.toHaveBeenCalled();
    });

    it('should skip if admin is not found', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.oneAsset);
      mocks.user.getAdmin.mockResolvedValue(void 0);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.asset.update).not.toHaveBeenCalled();
    });

    it('should skip if album is not owned by admin', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.oneAsset);
      mocks.user.getAdmin.mockResolvedValue(userStub.user1);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.asset.update).not.toHaveBeenCalled();
    });

    it('should skip if album has no assets', async () => {
      const album = { ...albumStub.empty, ownerId: userStub.admin.id };
      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.asset.update).not.toHaveBeenCalled();
    });

    it('should transfer ownership of assets not owned by album owner', async () => {
      const assets = [
        {
          ...assetStub.image,
          id: 'asset-1',
          ownerId: userStub.user1.id,
          exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 1000 },
        },
        {
          ...assetStub.image,
          id: 'asset-2',
          ownerId: userStub.admin.id,
          exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 2000 },
        },
        {
          ...assetStub.image,
          id: 'asset-3',
          ownerId: userStub.user2.id,
          exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 3000 },
        },
      ];
      const album = { ...albumStub.oneAsset, ownerId: userStub.admin.id, assets };

      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.asset.update).toHaveBeenCalledTimes(2);
      expect(mocks.asset.update).toHaveBeenCalledWith({
        id: 'asset-1',
        ownerId: userStub.admin.id,
      });
      expect(mocks.asset.update).toHaveBeenCalledWith({
        id: 'asset-3',
        ownerId: userStub.admin.id,
      });
      expect(mocks.user.updateUsage).toHaveBeenCalledTimes(4);
      expect(mocks.user.updateUsage).toHaveBeenCalledWith(userStub.user1.id, -1000);
      expect(mocks.user.updateUsage).toHaveBeenCalledWith(userStub.admin.id, 1000);
      expect(mocks.user.updateUsage).toHaveBeenCalledWith(userStub.user2.id, -3000);
      expect(mocks.user.updateUsage).toHaveBeenCalledWith(userStub.admin.id, 3000);
    });

    it('should not update usage for assets with libraryId', async () => {
      const assets = [
        {
          ...assetStub.image,
          id: 'asset-1',
          ownerId: userStub.user1.id,
          libraryId: 'lib-1',
          exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 1000 },
        },
      ];
      const album = { ...albumStub.oneAsset, ownerId: userStub.admin.id, assets };

      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.asset.update).toHaveBeenCalledTimes(1);
      expect(mocks.user.updateUsage).not.toHaveBeenCalled();
    });

    it('should not update usage for assets with zero file size', async () => {
      const assets = [
        {
          ...assetStub.image,
          id: 'asset-1',
          ownerId: userStub.user1.id,
          exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 0 },
        },
      ];
      const album = { ...albumStub.oneAsset, ownerId: userStub.admin.id, assets };

      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumUpdate({ id: 'album-id', recipientIds: [] });

      expect(mocks.asset.update).toHaveBeenCalledTimes(1);
      expect(mocks.user.updateUsage).not.toHaveBeenCalled();
    });
  });

  describe('handleAlbumInvite', () => {
    it('should skip if album is not found', async () => {
      mocks.album.getById.mockResolvedValue(void 0);

      await sut.handleAlbumInvite({ id: 'album-id', userId: 'user-id' });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).not.toHaveBeenCalled();
      expect(mocks.album.update).not.toHaveBeenCalled();
    });

    it('should skip if admin is not found', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.oneAsset);
      mocks.user.getAdmin.mockResolvedValue(void 0);

      await sut.handleAlbumInvite({ id: 'album-id', userId: 'user-id' });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.album.update).not.toHaveBeenCalled();
    });

    it('should skip if album is already owned by admin', async () => {
      const album = { ...albumStub.oneAsset, ownerId: userStub.admin.id };
      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumInvite({ id: 'album-id', userId: userStub.admin.id });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.album.update).not.toHaveBeenCalled();
    });

    it('should skip if invited user is not admin', async () => {
      mocks.album.getById.mockResolvedValue(albumStub.oneAsset);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumInvite({ id: 'album-id', userId: userStub.user1.id });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.album.update).not.toHaveBeenCalled();
    });

    it('should skip if admin is not an editor in the album', async () => {
      const album = {
        ...albumStub.oneAsset,
        ownerId: userStub.user1.id,
        albumUsers: [{ user: { id: userStub.admin.id }, role: AlbumUserRole.VIEWER } as AlbumUser],
      };

      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumInvite({ id: 'album-id', userId: userStub.admin.id });

      expect(mocks.album.getById).toHaveBeenCalledWith('album-id', { withAssets: true });
      expect(mocks.user.getAdmin).toHaveBeenCalled();
      expect(mocks.album.update).not.toHaveBeenCalled();
    });

    it('should transfer album ownership to admin and make previous owner an editor', async () => {
      mocks.albumUser.delete.mockResolvedValue(void 0);
      mocks.albumUser.create.mockResolvedValue({
        albumsId: 'album-id',
        usersId: 'user-id',
        role: AlbumUserRole.EDITOR,
      });
      const album = {
        ...albumStub.oneAsset,
        ownerId: userStub.user1.id,
        albumUsers: [{ user: { id: userStub.admin.id }, role: AlbumUserRole.EDITOR } as AlbumUser],
        assets: [
          {
            ...assetStub.image,
            id: 'asset-1',
            ownerId: userStub.user1.id,
            exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 1000 },
          },
          {
            ...assetStub.image,
            id: 'asset-2',
            ownerId: userStub.admin.id,
            exifInfo: { ...assetStub.image.exifInfo, fileSizeInByte: 2000 },
          },
        ],
      };

      mocks.album.getById.mockResolvedValue(album);
      mocks.user.getAdmin.mockResolvedValue(userStub.admin);

      await sut.handleAlbumInvite({ id: 'album-id', userId: userStub.admin.id });

      expect(mocks.album.update).toHaveBeenCalledWith('album-id', { ownerId: userStub.admin.id });
      expect(mocks.albumUser.delete).toHaveBeenCalledWith({ albumsId: 'album-id', usersId: userStub.admin.id });
      expect(mocks.albumUser.create).toHaveBeenCalledWith({
        albumsId: 'album-id',
        usersId: userStub.user1.id,
        role: AlbumUserRole.EDITOR,
      });

      expect(mocks.asset.update).toHaveBeenCalledTimes(1);
      expect(mocks.asset.update).toHaveBeenCalledWith({
        id: 'asset-1',
        ownerId: userStub.admin.id,
      });

      expect(mocks.user.updateUsage).toHaveBeenCalledTimes(2);
      expect(mocks.user.updateUsage).toHaveBeenCalledWith(userStub.user1.id, -1000);
      expect(mocks.user.updateUsage).toHaveBeenCalledWith(userStub.admin.id, 1000);
    });
  });
});
