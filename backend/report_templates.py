"""Curated report starters for the Genie report builder."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field


@dataclass(frozen=True)
class ReportTemplate:
    id: str
    title: str
    description: str
    prompt: str
    visual_type: str
    preferred_export: str
    required_columns: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


REPORT_TEMPLATES: tuple[ReportTemplate, ...] = (
    ReportTemplate(
        id="revenue-trend-month",
        title="Revenue Trend",
        description="Monthly revenue movement with enough history to show trend direction.",
        prompt=(
            "Show revenue by month for the most recent complete 12-month period. "
            "Include month, revenue, and any useful context for notable changes."
        ),
        visual_type="line",
        preferred_export="pptx",
        required_columns=["month", "revenue"],
    ),
    ReportTemplate(
        id="top-customers-revenue",
        title="Top Customers",
        description="Highest-value customers ranked by revenue for account review.",
        prompt=(
            "Show the top 10 customers by revenue for the most recent complete period. "
            "Include customer name, revenue, and rank."
        ),
        visual_type="bar",
        preferred_export="xlsx",
        required_columns=["customer", "revenue"],
    ),
    ReportTemplate(
        id="regional-performance",
        title="Regional Performance",
        description="Compare revenue and growth across regions to highlight mix shifts.",
        prompt=(
            "Compare performance by region for the current year versus the prior year. "
            "Include region, current year revenue, prior year revenue, and year-over-year change."
        ),
        visual_type="grouped_bar",
        preferred_export="pptx",
        required_columns=[
            "region",
            "current_year_revenue",
            "prior_year_revenue",
            "year_over_year_change",
        ],
    ),
    ReportTemplate(
        id="category-contribution",
        title="Category Contribution",
        description="Revenue contribution by product or category for portfolio review.",
        prompt=(
            "Show revenue contribution by product category for the most recent complete period. "
            "Include category, revenue, and share of total revenue."
        ),
        visual_type="bar",
        preferred_export="pdf",
        required_columns=["category", "revenue", "share_of_total"],
    ),
    ReportTemplate(
        id="margin-outliers",
        title="Margin Outliers",
        description="Find customers, products, or transactions with unusually low margin.",
        prompt=(
            "Identify the largest margin or cost outliers in the most recent complete period. "
            "Include the entity, revenue, cost, margin, and why it stands out."
        ),
        visual_type="table",
        preferred_export="xlsx",
        required_columns=["entity", "revenue", "cost", "margin"],
    ),
    ReportTemplate(
        id="year-over-year-change",
        title="Year-Over-Year Change",
        description="Largest positive and negative changes against the same period last year.",
        prompt=(
            "Show the largest year-over-year changes for the most relevant business metric. "
            "Include the dimension, current period value, prior period value, and percent change."
        ),
        visual_type="bar",
        preferred_export="pdf",
        required_columns=["dimension", "current_period", "prior_period", "percent_change"],
    ),
    ReportTemplate(
        id="operational-exceptions",
        title="Operational Exceptions",
        description="Surface anomalies or exception cases that need follow-up.",
        prompt=(
            "Find operational exceptions or anomalies in the most recent complete period. "
            "Rank them by business impact and include the relevant date, entity, metric, and impact."
        ),
        visual_type="table",
        preferred_export="xlsx",
        required_columns=["date", "entity", "metric", "impact"],
    ),
)


def list_report_templates() -> list[dict]:
    return [template.to_dict() for template in REPORT_TEMPLATES]


def get_report_template(template_id: str) -> ReportTemplate | None:
    return next(
        (template for template in REPORT_TEMPLATES if template.id == template_id),
        None,
    )
