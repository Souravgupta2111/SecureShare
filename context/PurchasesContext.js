/**
 * PurchasesContext — RevenueCat subscriptions.
 *
 * Free: up to 5 documents.
 * Pro ($3.99/mo, entitlement "pro"): unlimited documents + analytics + Verify Leak.
 *
 * The native SDK is loaded defensively so the app keeps running in builds that
 * don't include react-native-purchases yet (everyone is treated as Free until
 * you rebuild with the package + set EXPO_PUBLIC_REVENUECAT_IOS_KEY).
 */

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import PaywallModal from '../components/PaywallModal';

export const ENTITLEMENT_ID = 'pro';
export const FREE_DOC_LIMIT = 5;

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;

// Load the native SDK defensively — require() throws if the module isn't linked
// into the current native build.
let Purchases = null;
try {
    Purchases = require('react-native-purchases').default;
} catch (_e) {
    Purchases = null;
}

const PurchasesContext = createContext({
    isPro: false,
    loading: true,
    packages: [],
    available: false,
    purchasePackage: async () => ({ success: false }),
    restore: async () => ({ success: false }),
    presentPaywall: () => {},
    hidePaywall: () => {},
});

export const usePurchases = () => useContext(PurchasesContext);

export const PurchasesProvider = ({ children }) => {
    const [isPro, setIsPro] = useState(false);
    const [loading, setLoading] = useState(true);
    const [packages, setPackages] = useState([]);
    const [paywallVisible, setPaywallVisible] = useState(false);

    const apiKey = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
    const available = !!(Purchases && apiKey);

    const applyInfo = useCallback((info) => {
        const active = info?.entitlements?.active || {};
        setIsPro(!!active[ENTITLEMENT_ID]);
    }, []);

    useEffect(() => {
        const init = async () => {
            if (!available) {
                setLoading(false);
                return;
            }
            try {
                Purchases.configure({ apiKey });
                const info = await Purchases.getCustomerInfo();
                applyInfo(info);
                try {
                    const offerings = await Purchases.getOfferings();
                    setPackages(offerings?.current?.availablePackages || []);
                } catch (_e) { /* offerings optional */ }
                Purchases.addCustomerInfoUpdateListener(applyInfo);
            } catch (e) {
                console.warn('[Purchases] init failed:', e.message);
            } finally {
                setLoading(false);
            }
        };
        init();
        return () => {
            try { Purchases?.removeCustomerInfoUpdateListener?.(applyInfo); } catch (_e) { /* noop */ }
        };
    }, [available, apiKey, applyInfo]);

    const purchasePackage = useCallback(async (pkg) => {
        if (!available) return { success: false, error: 'Subscriptions are not available in this build.' };
        try {
            const { customerInfo } = await Purchases.purchasePackage(pkg);
            applyInfo(customerInfo);
            const ok = !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
            if (ok) setPaywallVisible(false);
            return { success: ok };
        } catch (e) {
            if (e?.userCancelled) return { success: false, cancelled: true };
            return { success: false, error: e?.message };
        }
    }, [available, applyInfo]);

    const restore = useCallback(async () => {
        if (!available) return { success: false };
        try {
            const info = await Purchases.restorePurchases();
            applyInfo(info);
            const ok = !!info?.entitlements?.active?.[ENTITLEMENT_ID];
            if (ok) setPaywallVisible(false);
            return { success: ok };
        } catch (e) {
            return { success: false, error: e?.message };
        }
    }, [available, applyInfo]);

    const presentPaywall = useCallback(() => setPaywallVisible(true), []);
    const hidePaywall = useCallback(() => setPaywallVisible(false), []);

    const value = {
        isPro,
        loading,
        packages,
        available,
        purchasePackage,
        restore,
        presentPaywall,
        hidePaywall,
    };

    return (
        <PurchasesContext.Provider value={value}>
            {children}
            <PaywallModal
                visible={paywallVisible}
                onClose={hidePaywall}
                packages={packages}
                available={available}
                onPurchase={purchasePackage}
                onRestore={restore}
            />
        </PurchasesContext.Provider>
    );
};

export default PurchasesContext;
