/**
 * Sequelize model mock factories.
 * Each factory creates a jest.fn() mock that mimics the static/instance methods
 * used by our services.
 */

type MockModel = {
  findAll: jest.Mock;
  findOne: jest.Mock;
  findByPk: jest.Mock;
  findAndCountAll: jest.Mock;
  create: jest.Mock;
  update: jest.Mock;
  destroy: jest.Mock;
  count: jest.Mock;
  upsert: jest.Mock;
  sum: jest.Mock;
  literal: jest.Mock;
  reload: jest.Mock;
  toJSON: jest.Mock;
  [key: string]: any;
};

export function createMockModel(data: Record<string, unknown> = {}): MockModel {
  const instance = {
    ...data,
    update: jest.fn().mockImplementation(function (this: any, updates: any) {
      Object.assign(this, updates);
      return Promise.resolve(this);
    }),
    destroy: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
    toJSON: jest.fn().mockImplementation(function (this: any) {
      return { ...this };
    }),
  };

  const model: MockModel = {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    create: jest.fn().mockResolvedValue(instance),
    update: jest.fn().mockResolvedValue([0]),
    destroy: jest.fn().mockResolvedValue(0),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue(instance),
    sum: jest.fn().mockResolvedValue(0),
    literal: jest.fn((val: string) => ({ val, type: 'literal' })),
    reload: jest.fn().mockResolvedValue(instance),
    toJSON: jest.fn().mockReturnValue(instance),
  };

  return model;
}

export function createMockSequelize() {
  return {
    authenticate: jest.fn().mockResolvedValue(undefined),
    sync: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    transaction: jest.fn((fn: any) => fn({})),
    col: jest.fn((val: string) => ({ val, type: 'col' })),
    literal: jest.fn((val: string) => ({ val, type: 'literal' })),
  };
}
