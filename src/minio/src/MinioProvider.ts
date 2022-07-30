import { Client as MinioClient } from 'minio';
import { GetInjectToken, Inject, Injectable, Singleton } from '../../core/src/di/Dependency';
import { GetProviderInjectToken, OssProvider } from '../../oss-core/src/OssProvider';
import { GetOssOptionsInjectToken } from '../../oss-core/src/OssOptions';
import { StreamHelper } from '../../core/src/util/StreamHelper';
import { SimpleKoaError } from '../../core/src/error/SimpleKoaError';
import { Guid } from '../../core/src/util/Guid';
import { OSS_KEY } from './MinioConst';
import { MinioOptions } from './MinioOptions';

interface MinioFileInfo {
  fileName: string;
  bucketName: string;
}

@Injectable()
@Singleton(GetProviderInjectToken(OSS_KEY))
export class MinioProvider extends OssProvider {
  private readonly _options: MinioOptions;
  private readonly _client: MinioClient;

  constructor(@Inject(GetOssOptionsInjectToken(OSS_KEY)) options: MinioOptions) {
    super();
    this._options = options;
    this._client = GetClient(options);
  }

  async GetAsync(path: string): Promise<Buffer> {
    const fileInfo = this.GetBucketNameAndFileName(path);
    const data = await this._client.getObject(fileInfo.bucketName, fileInfo.fileName);
    return StreamHelper.StreamToBuffer(data);
  }

  async SaveAsync(data: Buffer, fileName: string, group?: string | undefined): Promise<string> {
    const bucketName = group || this._defaultGroup;
    await this.CreateBucketAsync(bucketName);
    const newFileName = this.NewFileName(fileName);
    try {
      await this._client.putObject(bucketName, newFileName, data);
      return this.FullTag(newFileName, bucketName);
    } catch (error) {
      throw new SimpleKoaError('文件上传Minio失败', error);
    }
  }

  async RemoveAsync(path: string): Promise<void> {
    const fileInfo = this.GetBucketNameAndFileName(path);
    await this._client.removeObject(fileInfo.bucketName, fileInfo.fileName);
  }

  protected async CreateBucketAsync(name: string) {
    const buckets = await this._client.listBuckets();
    if (buckets && buckets.length) {
      const bucket = buckets.find((p) => p.name === name);
      if (bucket) return;
    }
    await this._client.makeBucket(name, 'cn-north-1');
  }

  protected NewFileName(fileName: string) {
    const f = this.GetFileType(fileName);
    return `${Guid.Create()}${f}`;
  }

  protected FullTag(fileName: string, bucketName?: string) {
    return `${bucketName || this._defaultGroup}/${fileName}`;
  }

  protected GetBucketNameAndFileName(path: string): MinioFileInfo {
    const index = path.indexOf('/');
    if (index < 0) {
      return {
        fileName: path,
        bucketName: this._defaultGroup,
      };
    } else {
      const group = path.substring(0, index) || this._defaultGroup;
      const fileName = path.substring(index);
      return {
        fileName: fileName,
        bucketName: group,
      };
    }
  }
}

function GetClient(options: MinioOptions): MinioClient {
  if (!options) throw new SimpleKoaError('缺少Minio配置,请初始化Minio配置');
  const client = new MinioClient({
    endPoint: options.addr,
    port: options.port,
    accessKey: options.userName,
    secretKey: options.password,
    useSSL: options.useSSL,
  });
  return client;
}
