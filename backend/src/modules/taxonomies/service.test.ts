import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TaxonomiesService, TaxonomyConflictError, TaxonomyNotFoundError } from './service.js';

const mockPainPointCategory = {
  id: 'ppc_001',
  key: 'cash_flow',
  labelEs: 'Flujo de caja',
  descriptionEs: 'Problemas con la tesorería',
  defaultServiceRecommendations: ['contabilidad'],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockServiceLine = {
  id: 'sl_001',
  key: 'contabilidad',
  labelEs: 'Contabilidad',
  descriptionEs: 'Servicios de contabilidad',
  subCapabilities: [],
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockContentPillar = {
  id: 'cp_001',
  key: 'educacion_financiera',
  labelEs: 'Educación financiera',
  descriptionEs: 'Contenido educativo sobre finanzas',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockDb = {
  painPointCategory: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  serviceLine: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  contentPillar: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

describe('TaxonomiesService', () => {
  let service: TaxonomiesService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new TaxonomiesService(mockDb as never);
  });

  // PainPointCategory
  describe('listPainPointCategories', () => {
    it('devuelve lista ordenada por key', async () => {
      mockDb.painPointCategory.findMany.mockResolvedValue([mockPainPointCategory]);
      const result = await service.listPainPointCategories();
      expect(result).toHaveLength(1);
      expect(result[0]?.key).toBe('cash_flow');
      expect(mockDb.painPointCategory.findMany).toHaveBeenCalledWith({ orderBy: { key: 'asc' } });
    });
  });

  describe('createPainPointCategory', () => {
    it('crea y devuelve DTO', async () => {
      mockDb.painPointCategory.findUnique.mockResolvedValue(null);
      mockDb.painPointCategory.create.mockResolvedValue(mockPainPointCategory);
      const result = await service.createPainPointCategory({
        key: 'cash_flow',
        labelEs: 'Flujo de caja',
        descriptionEs: 'Problemas con la tesorería',
      });
      expect(result.key).toBe('cash_flow');
      expect(result).not.toHaveProperty('painPoints');
    });

    it('lanza TaxonomyConflictError si key duplicada', async () => {
      mockDb.painPointCategory.findUnique.mockResolvedValue(mockPainPointCategory);
      await expect(
        service.createPainPointCategory({ key: 'cash_flow', labelEs: 'x', descriptionEs: 'y' }),
      ).rejects.toThrow(TaxonomyConflictError);
    });
  });

  describe('updatePainPointCategory', () => {
    it('actualiza campos correctamente', async () => {
      mockDb.painPointCategory.findUnique.mockResolvedValue(mockPainPointCategory);
      mockDb.painPointCategory.update.mockResolvedValue({
        ...mockPainPointCategory,
        labelEs: 'Nuevo',
      });
      const result = await service.updatePainPointCategory('ppc_001', { labelEs: 'Nuevo' });
      expect(result.labelEs).toBe('Nuevo');
    });

    it('lanza TaxonomyNotFoundError si no existe', async () => {
      mockDb.painPointCategory.findUnique.mockResolvedValue(null);
      await expect(service.updatePainPointCategory('missing', { isActive: false })).rejects.toThrow(
        TaxonomyNotFoundError,
      );
    });
  });

  // ServiceLine
  describe('listServiceLines', () => {
    it('devuelve lista ordenada', async () => {
      mockDb.serviceLine.findMany.mockResolvedValue([mockServiceLine]);
      const result = await service.listServiceLines();
      expect(result).toHaveLength(1);
      expect(result[0]?.key).toBe('contabilidad');
    });
  });

  describe('createServiceLine', () => {
    it('crea y devuelve DTO', async () => {
      mockDb.serviceLine.findUnique.mockResolvedValue(null);
      mockDb.serviceLine.create.mockResolvedValue(mockServiceLine);
      const result = await service.createServiceLine({
        key: 'contabilidad',
        labelEs: 'Contabilidad',
        descriptionEs: 'Servicios de contabilidad',
      });
      expect(result.key).toBe('contabilidad');
    });

    it('lanza TaxonomyConflictError si key duplicada', async () => {
      mockDb.serviceLine.findUnique.mockResolvedValue(mockServiceLine);
      await expect(
        service.createServiceLine({ key: 'contabilidad', labelEs: 'x', descriptionEs: 'y' }),
      ).rejects.toThrow(TaxonomyConflictError);
    });
  });

  describe('updateServiceLine', () => {
    it('lanza TaxonomyNotFoundError si no existe', async () => {
      mockDb.serviceLine.findUnique.mockResolvedValue(null);
      await expect(service.updateServiceLine('missing', { isActive: false })).rejects.toThrow(
        TaxonomyNotFoundError,
      );
    });
  });

  // ContentPillar
  describe('listContentPillars', () => {
    it('devuelve lista ordenada', async () => {
      mockDb.contentPillar.findMany.mockResolvedValue([mockContentPillar]);
      const result = await service.listContentPillars();
      expect(result).toHaveLength(1);
      expect(result[0]?.key).toBe('educacion_financiera');
    });
  });

  describe('createContentPillar', () => {
    it('lanza TaxonomyConflictError si key duplicada', async () => {
      mockDb.contentPillar.findUnique.mockResolvedValue(mockContentPillar);
      await expect(
        service.createContentPillar({
          key: 'educacion_financiera',
          labelEs: 'x',
          descriptionEs: 'y',
        }),
      ).rejects.toThrow(TaxonomyConflictError);
    });
  });

  describe('updateContentPillar', () => {
    it('lanza TaxonomyNotFoundError si no existe', async () => {
      mockDb.contentPillar.findUnique.mockResolvedValue(null);
      await expect(service.updateContentPillar('missing', { isActive: false })).rejects.toThrow(
        TaxonomyNotFoundError,
      );
    });
  });
});
