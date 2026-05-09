export class OpenFileCoordinator {
  private pendingFilePaths: string[] = []
  private pendingSongIds: number[] = []

  enqueueFilePaths(filePaths: string[]) {
    this.pendingFilePaths = [...this.pendingFilePaths, ...filePaths]
  }

  enqueueSongIds(songIds: number[]) {
    this.pendingSongIds = [...this.pendingSongIds, ...songIds]
  }

  takeFilePaths() {
    const filePaths = this.pendingFilePaths
    this.pendingFilePaths = []
    return filePaths
  }

  takeSongIds() {
    const songIds = this.pendingSongIds
    this.pendingSongIds = []
    return songIds
  }
}
