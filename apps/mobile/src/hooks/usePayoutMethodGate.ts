import { useQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { apiClient } from '../api/client';
import type { PaymentMethod } from '../api/types';
import type { DriverStatus } from '../api/types';

type GateStatus = Pick<DriverStatus, 'status' | 'step'> | undefined;

export function usePayoutMethodGate(driverStatus: GateStatus) {
  const isApproved = driverStatus?.status === 'approved' || driverStatus?.step === 'approved';

  const {
    data: methods,
    isLoading,
    isError,
    refetch,
  } = useQuery<PaymentMethod[]>({
    queryKey: ['payment-methods'],
    queryFn: async () => {
      const response = await apiClient.get('/drivers/me/payment-methods');
      return response.data.data ?? response.data;
    },
    enabled: isApproved,
    staleTime: 30_000,
  });

  const needsPayoutMethod = useMemo(() => {
    if (!isApproved) return false;
    if (isLoading || isError) return false;
    return (methods?.length ?? 0) === 0;
  }, [isApproved, isLoading, isError, methods]);

  const refresh = useCallback(() => refetch(), [refetch]);

  return {
    isApproved,
    needsPayoutMethod,
    isLoadingMethods: isLoading,
    refreshPayoutMethods: refresh,
  };
}
