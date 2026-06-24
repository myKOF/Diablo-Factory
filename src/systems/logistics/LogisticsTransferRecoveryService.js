export class LogisticsTransferRecoveryService {
    constructor(options = {}) {
        this.getEntityId = options.getEntityId || ((entity) => entity?.id || null);
    }

    getTransferItemType(transfer) {
        const rawType = transfer?.itemType || transfer?.type || transfer?.resourceType || transfer?.filter || null;
        return rawType ? String(rawType).trim().toLowerCase() : null;
    }

    getEntityCapacity(entity, keys) {
        for (const key of keys) {
            const value = Number(entity?.[key]);
            if (Number.isFinite(value) && value >= 0) return value;
        }
        return Infinity;
    }

    getStoredTotal(store) {
        if (!store || typeof store !== 'object') return 0;
        return Object.values(store).reduce((sum, value) => sum + Math.max(0, Number(value) || 0), 0);
    }

    getRecoveryStore(source) {
        const isStorageSource = !!source?.storage || ['warehouse', 'storehouse', 'barn', 'town_center', 'village'].includes(source?.type1);
        return {
            key: isStorageSource ? 'storage' : 'outputBuffer',
            capacityKeys: isStorageSource
                ? ['storageCapacity', 'capacity']
                : ['outputCapacity', 'bufferCapacity', 'storageCapacity', 'capacity']
        };
    }

    recordDestroyedTransfer(state, transfer, reason) {
        if (!state) return;
        if (!Array.isArray(state.destroyedLogisticsTransfers)) state.destroyedLogisticsTransfers = [];
        state.destroyedLogisticsTransfers.push({
            transferId: transfer?.id || null,
            sourceId: transfer?.sourceId || null,
            targetId: transfer?.targetId || null,
            itemType: this.getTransferItemType(transfer),
            amount: Math.max(1, Math.floor(Number(transfer?.amount ?? transfer?.quantity ?? 1) || 1)),
            reason
        });
    }

    recoverToSourceOrDestroy(transfer, context = {}) {
        const state = context.state || null;
        const entities = Array.isArray(context.entities) ? context.entities : [];
        const getEntityId = context.getEntityId || this.getEntityId;
        const sourceId = transfer?.sourceId || null;
        const itemType = this.getTransferItemType(transfer);
        const amount = Math.max(1, Math.floor(Number(transfer?.amount ?? transfer?.quantity ?? 1) || 1));

        if (!sourceId || !itemType) {
            this.recordDestroyedTransfer(state, transfer, 'missing_source_or_item');
            return { returned: false, destroyed: true, reason: 'missing_source_or_item' };
        }

        const source = entities.find(entity => getEntityId(entity) === sourceId) || null;
        if (!source) {
            this.recordDestroyedTransfer(state, transfer, 'source_missing');
            return { returned: false, destroyed: true, reason: 'source_missing' };
        }

        const storeInfo = this.getRecoveryStore(source);
        if (!source[storeInfo.key]) source[storeInfo.key] = {};
        const capacity = this.getEntityCapacity(source, storeInfo.capacityKeys);
        if (this.getStoredTotal(source[storeInfo.key]) + amount > capacity) {
            this.recordDestroyedTransfer(state, transfer, 'source_full');
            return { returned: false, destroyed: true, reason: 'source_full' };
        }

        source[storeInfo.key][itemType] = (source[storeInfo.key][itemType] || 0) + amount;
        return { returned: true, destroyed: false, reason: 'returned_to_source' };
    }
}
