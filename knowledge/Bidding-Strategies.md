---
title: Bidding Strategies
topic_key: Bidding-Strategies
confidence: High
last_updated: 2026-09-02
sources:
  - url: https://advertising.amazon.com/solutions/products/sponsored-products
    type: official
    last_checked: 2026-09-02
  - url: https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/
    type: blog
    last_checked: 2026-09-02
  - url: https://github.com/amzn/amazon-advertising-api-php-sdk
    type: repo-readme
    last_checked: 2026-09-02
related: [Sponsored-Products, Budget-Placement, Advertising-API]
disputed: false
---

## Overview

Sponsored Products campaigns have no monthly or upfront fees; advertisers instead enter a bid representing the maximum they are willing to pay per click, with more competitive bids increasing the likelihood of the ad being shown. In an auction, the actual amount charged depends on competing bids and may be less than the full bid (e.g., the second-highest bid). Sellers can choose from three bidding strategies — dynamic bid-down only, dynamic bid-up and down (up to 100% higher for likely-to-convert clicks), or fixed bids — and can further adjust bids by ad placement. The Advertising API also offers bid recommendations for an ad group or individual keyword, including a suggested bid and a recommended range, and can return bulk bid suggestions for up to 100 keywords per request.

## Facts

- Sponsored Products campaigns have no monthly or upfront fees; advertisers instead enter a bid representing the maximum amount they are willing to pay when a shopper clicks their ad, and a more competitive bid increases the likelihood the ad is shown for a matching shopping query. — [source](https://advertising.amazon.com/solutions/products/sponsored-products), confidence: High, last-checked: 2026-09-02
- In a Sponsored Products auction, a bid is the maximum amount a seller is willing to pay for a click, but the actual amount charged depends on competitors' bids and may be less than the full bid amount (e.g., the second-highest bid). — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Sponsored Products campaigns offer three bidding strategies: dynamic bid-down only (Amazon lowers the bid when a click is less likely to convert), dynamic bid-up and down (Amazon can raise the bid by up to 100% when a click is more likely to convert, and lower it otherwise), and fixed bids (bids stay the same until manually changed). — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Sponsored Products campaigns allow sellers to adjust their bids by placement. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- The Amazon Advertising API provides bid recommendations for an ad group or an individual keyword, returning a suggested bid along with a recommended bid range (rangeStart to rangeEnd). (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
- The Amazon Advertising API's bulk keyword bid recommendation call supports requesting suggested bids for up to 100 keywords in a single request. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
