---
type: knowledge-doc
title: Reporting Optimization
topic_key: Reporting-Optimization
confidence: High
last_updated: 2026-09-07
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
  - url: https://advertising.amazon.com/solutions/products/sponsored-brands
    type: official
    last_checked: 2026-09-02
  - url: https://advertising.amazon.com/solutions/products/amazon-dsp
    type: official
    last_checked: 2026-09-07
related: [Sponsored-Products, Keyword-Targeting, ACOS-ROAS-Metrics, Bidding-Strategies, Advertising-API, Sponsored-Brands, Amazon-DSP]
disputed: false
---

## Overview

Once a Sponsored Products campaign is live, advertisers can generate reports on sales, product/target performance, and placement performance. For automatic targeting campaigns, the search terms tab shows clicks, spend, sales, and ACoS per term, helping sellers spot poor performers (e.g., roughly 10 clicks with no sales) to add as negative keywords and strong performers to promote into manual campaigns; manual campaign optimization involves lowering or pausing bids on keywords with high ACoS or high clicks/impressions but low sales, and raising bids on underexposed but relevant or low-ACoS keywords. It's recommended to let a new campaign run at least two weeks before making optimization changes, so Amazon can gather sufficient performance data. Sponsored Brands reporting also includes branded search metrics, which reveal when ads prompt shoppers to search for brand names, trademarks, or common variations like abbreviations. At the API level, performance reports (covering metrics like impressions, clicks, and cost) and entity snapshots are both generated asynchronously and retrieved separately once processing completes. Amazon DSP campaign reporting adds industry-standard and Amazon-proprietary metrics (detail page view rate, add-to-list, new-to-brand, reach, frequency, viewability), plus omnichannel measurement solutions like Omnichannel Metrics, Marketing Mix Modeling, and custom event-level analytics via Amazon Marketing Cloud.

## Facts

- After launching a Sponsored Products campaign, advertisers can generate reports showing sales and performance of advertised products or targets and how different ad placements are performing. — [source](https://advertising.amazon.com/solutions/products/sponsored-products), confidence: High, last-checked: 2026-09-02
- For automatic targeting campaigns, the search terms tab in the campaign manager shows all search terms Amazon has targeted along with clicks, spend, sales, and ACoS for each term, letting sellers identify worst-performing keywords (high clicks/spend but no sales) to add to a negative keyword list, and best-performing keywords (high sales, low ACoS) to move into a manual targeting campaign. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- A common rule of thumb for optimizing automatic Sponsored Products campaigns is to treat any keyword with about 10 clicks but no sales as a candidate for the negative keyword list. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- For manual campaign optimization, sellers are advised to lower or remove bids on keywords exceeding target ACoS or with high impressions/clicks but low sales, increase bids on keywords with low impressions and low ACoS or that are highly relevant but underexposed, and pause keywords with high clicks and high ACoS. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- It is recommended to let a new Sponsored Products campaign run for at least two weeks before making changes, so Amazon can gather enough performance data to inform optimization decisions. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- The Amazon Advertising API supports requesting a customized performance report for all entities of a given type (e.g. campaigns) that generates asynchronously and is retrieved separately once processing completes. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
- Amazon Advertising API performance reports can include metrics such as impressions, clicks, and cost for entities like campaigns. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
- The Amazon Advertising API supports requesting a 'snapshot' of all entities of a single type (such as all campaigns), which is generated asynchronously and retrieved once its status is complete. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
- Branded search metrics for Sponsored Brands identify when advertising influences shoppers to search for brand names, trademarks, and common variations like abbreviations. — [source](https://advertising.amazon.com/solutions/products/sponsored-brands), confidence: High, last-checked: 2026-09-02
- Amazon DSP campaign reporting includes industry-standard metrics and Amazon-proprietary metrics such as detail page view rate (DPVR), add-to-list (ATL) counts, and new-to-brand (NTB) metrics, along with reach, frequency, and viewability metrics, and eligible advertisers can also use third-party measurement solutions like brand lift studies and offline sales lift insights. — [source](https://advertising.amazon.com/solutions/products/amazon-dsp), confidence: High, last-checked: 2026-09-07
- Amazon provides omnichannel measurement solutions such as Omnichannel Metrics (OCM) and Marketing Mix Modeling (MMM), plus custom analytics across Amazon DSP campaigns using event-level data sets in Amazon Marketing Cloud. — [source](https://advertising.amazon.com/solutions/products/amazon-dsp), confidence: High, last-checked: 2026-09-07
