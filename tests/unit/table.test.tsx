import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from "../../src/components/ui/table";


describe("Table component", () => {
  it("renders a table container div", () => {
    const { container } = render(<Table>Content</Table>);
    const wrapper = container.querySelector("[data-slot='table-container']");
    expect(wrapper).toBeInTheDocument();
  });

  it("renders a table element", () => {
    const { container } = render(<Table />);
    const table = container.querySelector("table");
    expect(table).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<Table />);
    const table = container.querySelector("table");
    expect(table).toHaveAttribute("data-slot", "table");
  });

  it("applies custom className", () => {
    const { container } = render(<Table className="custom-table" />);
    const table = container.querySelector("table");
    expect(table).toHaveClass("custom-table");
  });

  it("passes through additional props", () => {
    render(<Table data-testid="my-table" />);
    expect(screen.getByTestId("my-table")).toBeInTheDocument();
  });

  it("renders children inside the table", () => {
    const { container } = render(
      <Table>
        <caption>Test Caption</caption>
      </Table>,
    );
    const caption = container.querySelector("caption");
    expect(caption).toHaveTextContent("Test Caption");
  });
});

describe("TableHeader component", () => {
  it("renders a thead element", () => {
    const { container } = render(<TableHeader />);
    const thead = container.querySelector("thead");
    expect(thead).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<TableHeader />);
    const thead = container.querySelector("thead");
    expect(thead).toHaveAttribute("data-slot", "table-header");
  });

  it("applies custom className", () => {
    const { container } = render(<TableHeader className="custom-header" />);
    const thead = container.querySelector("thead");
    expect(thead).toHaveClass("custom-header");
  });
});

describe("TableBody component", () => {
  it("renders a tbody element", () => {
    const { container } = render(<TableBody />);
    const tbody = container.querySelector("tbody");
    expect(tbody).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<TableBody />);
    const tbody = container.querySelector("tbody");
    expect(tbody).toHaveAttribute("data-slot", "table-body");
  });

  it("applies custom className", () => {
    const { container } = render(<TableBody className="custom-body" />);
    const tbody = container.querySelector("tbody");
    expect(tbody).toHaveClass("custom-body");
  });
});

describe("TableFooter component", () => {
  it("renders a tfoot element", () => {
    const { container } = render(<TableFooter />);
    const tfoot = container.querySelector("tfoot");
    expect(tfoot).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<TableFooter />);
    const tfoot = container.querySelector("tfoot");
    expect(tfoot).toHaveAttribute("data-slot", "table-footer");
  });

  it("applies custom className", () => {
    const { container } = render(<TableFooter className="custom-footer" />);
    const tfoot = container.querySelector("tfoot");
    expect(tfoot).toHaveClass("custom-footer");
  });
});

describe("TableRow component", () => {
  it("renders a tr element", () => {
    const { container } = render(<TableRow />);
    const tr = container.querySelector("tr");
    expect(tr).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<TableRow />);
    const tr = container.querySelector("tr");
    expect(tr).toHaveAttribute("data-slot", "table-row");
  });

  it("applies custom className", () => {
    const { container } = render(<TableRow className="custom-row" />);
    const tr = container.querySelector("tr");
    expect(tr).toHaveClass("custom-row");
  });
});

describe("TableHead component", () => {
  it("renders a th element", () => {
    render(<TableHead>Header</TableHead>);
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<TableHead>Head</TableHead>);
    const th = container.querySelector("th");
    expect(th).toHaveAttribute("data-slot", "table-head");
  });

  it("applies custom className", () => {
    const { container } = render(<TableHead className="custom-head">Head</TableHead>);
    const th = container.querySelector("th");
    expect(th).toHaveClass("custom-head");
  });
});

describe("TableCell component", () => {
  it("renders a td element", () => {
    render(<TableCell>Cell Content</TableCell>);
    expect(screen.getByText("Cell Content")).toBeInTheDocument();
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(<TableCell>Cell</TableCell>);
    const td = container.querySelector("td");
    expect(td).toHaveAttribute("data-slot", "table-cell");
  });

  it("applies custom className", () => {
    const { container } = render(<TableCell className="custom-cell">Cell</TableCell>);
    const td = container.querySelector("td");
    expect(td).toHaveClass("custom-cell");
  });
});

describe("TableCaption component", () => {
  it("renders a caption element", () => {
    const { container } = render(
      <Table>
        <TableCaption>Caption Text</TableCaption>
      </Table>,
    );
    const caption = container.querySelector("caption");
    expect(caption).toHaveTextContent("Caption Text");
  });

  it("passes through data-slot attribute", () => {
    const { container } = render(
      <Table>
        <TableCaption>My Caption</TableCaption>
      </Table>,
    );
    const caption = container.querySelector("caption");
    expect(caption).toHaveAttribute("data-slot", "table-caption");
  });

  it("applies custom className", () => {
    const { container } = render(
      <Table>
        <TableCaption className="custom-caption">Caption</TableCaption>
      </Table>,
    );
    const caption = container.querySelector("caption");
    expect(caption).toHaveClass("custom-caption");
  });
});

describe("Table integration", () => {
  it("renders a complete table structure", () => {
    const { container } = render(
      <Table>
        <TableCaption>Monthly Report</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Test</TableCell>
            <TableCell>$100</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>Total</TableCell>
            <TableCell>$100</TableCell>
          </TableRow>
        </TableFooter>
      </Table>,
    );

    expect(container.querySelector("table")).toBeInTheDocument();
    expect(container.querySelector("caption")).toHaveTextContent("Monthly Report");
    expect(container.querySelectorAll("thead tr")).toHaveLength(1);
    expect(container.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelectorAll("tfoot tr")).toHaveLength(1);
    expect(container.querySelectorAll("th")).toHaveLength(2);
    expect(container.querySelectorAll("td")).toHaveLength(4);
  });
});
