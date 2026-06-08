import { apiClient } from "./client";

export const billingApi = {
  getPlans: async () => {
    const { data } = await apiClient.get("/payments/plans");
    return data;
  },

  getMyPlan: async () => {
    const { data } = await apiClient.get("/payments/my-plan");
    return data;
  },

  createOrder: async (productId: string) => {
    const { data } = await apiClient.post("/payments/create-order", { product_id: productId });
    return data;
  },

  verifyPayment: async (payload: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    product_id: string;
  }) => {
    const { data } = await apiClient.post("/payments/verify-payment", payload);
    return data;
  },

  createSubscription: async (plan: "pro_monthly" | "pro_yearly") => {
    const { data } = await apiClient.post("/payments/create-subscription", { plan });
    return data;
  },

  verifySubscription: async (payload: {
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
    plan: string;
  }) => {
    const { data } = await apiClient.post("/payments/verify-subscription", payload);
    return data;
  },

  cancelSubscription: async () => {
    const { data } = await apiClient.post("/payments/cancel-subscription");
    return data;
  },
};
