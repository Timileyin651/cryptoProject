import { Model, ModelStatic, FindOptions, CreateOptions, UpdateOptions } from 'sequelize';
import { NotFoundError } from '../utils/errors';

export class BaseRepository<T extends Model> {
  protected model: ModelStatic<T>;

  constructor(model: ModelStatic<T>) {
    this.model = model;
  }

  async findAll(options?: FindOptions): Promise<T[]> {
    return this.model.findAll(options);
  }

  async findById(id: number, options?: FindOptions): Promise<T | null> {
    return this.model.findByPk(id, options);
  }

  async findByIdOrThrow(id: number, options?: FindOptions): Promise<T> {
    const record = await this.findById(id, options);
    if (!record) {
      throw new NotFoundError(`${this.model.name} with id ${id} not found`);
    }
    return record;
  }

  async findOne(options: FindOptions): Promise<T | null> {
    return this.model.findOne(options);
  }

  async create(data: Partial<T['_creationAttributes']>, options?: CreateOptions): Promise<T> {
    return this.model.create(data as T['_creationAttributes'], options);
  }

  async update(id: number, data: Partial<T>, options?: UpdateOptions): Promise<T> {
    const record = await this.findByIdOrThrow(id);
    await record.update(data, options);
    return record;
  }

  async delete(id: number): Promise<void> {
    const record = await this.findByIdOrThrow(id);
    await record.destroy();
  }

  async count(options?: FindOptions): Promise<number> {
    return this.model.count(options);
  }
}
