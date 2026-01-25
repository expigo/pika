"use client";

import { useReportWebVitals } from "next/web-vitals";
import { logger } from "@pika/shared";

export function WebVitals() {
  useReportWebVitals((metric) => {
    // Only report important metrics or if they are poor
    // L3: Web Vitals tracking
    const isPoor =
      (metric.name === "CLS" && metric.value > 0.1) ||
      (metric.name === "LCP" && metric.value > 2500) ||
      (metric.name === "FID" && metric.value > 100) ||
      (metric.name === "TTFB" && metric.value > 800);

    if (isPoor) {
      logger.info(`[WebVitals] Poor ${metric.name} detected`, {
        metric: metric.name,
        value: metric.value,
        rating: metric.rating,
      });
    } else {
      // In development, or for sampled production, we could send everything
      // logger.debug(`[WebVitals] ${metric.name}`, metric);
    }
  });

  return null;
}
