// mui table wrapper. client-side sort + pagination + empty state.
// columns: [{ field, header, render?, align?, sortable?, sortValue? }]
// rows need a unique `keyField` value each

import { useState, useMemo } from 'react';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  TableSortLabel,
  Typography,
  Paper,
  TableContainer,
} from '@mui/material';

// nulls/undefined sort last regardless of direction, otherwise
// a desc sort pins them at the top and buries real values
function compareValues(a, b) {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

export default function LazyTable({
  columns,
  rows,
  keyField = 'ticker',
  pageSize = 10,
  emptyMessage = 'No rows.',
}) {
  const [page, setPage] = useState(0);
  const [orderBy, setOrderBy] = useState(null);
  const [order, setOrder] = useState('asc');

  const sorted = useMemo(() => {
    if (!orderBy) return rows;
    const col = columns.find((c) => c.field === orderBy);
    if (!col) return rows;
    const getValue = col.sortValue || ((row) => row[col.field]);
    const dir = order === 'asc' ? 1 : -1;
    // slice so we don't mutate the caller's array
    return [...rows].sort((a, b) => dir * compareValues(getValue(a), getValue(b)));
  }, [rows, columns, orderBy, order]);

  const paged = useMemo(() => {
    const start = page * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, page, pageSize]);

  const handleSort = (field) => {
    if (orderBy === field) {
      setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setOrderBy(field);
      setOrder('asc');
    }
    setPage(0);
  };

  if (!rows || rows.length === 0) {
    return (
      <Paper sx={{ p: 2 }} elevation={0}>
        <Typography color="text.secondary">{emptyMessage}</Typography>
      </Paper>
    );
  }

  return (
    <TableContainer component={Paper} elevation={1}>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((col) => {
              const sortable = col.sortable !== false;
              const active = orderBy === col.field;
              return (
                <TableCell
                  key={col.field}
                  align={col.align || 'left'}
                  sortDirection={active ? order : false}
                >
                  {sortable ? (
                    <TableSortLabel
                      active={active}
                      direction={active ? order : 'asc'}
                      onClick={() => handleSort(col.field)}
                    >
                      <strong>{col.header}</strong>
                    </TableSortLabel>
                  ) : (
                    <strong>{col.header}</strong>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {paged.map((row) => (
            <TableRow key={row[keyField]} hover>
              {columns.map((col) => (
                <TableCell key={col.field} align={col.align || 'left'}>
                  {col.render ? col.render(row) : row[col.field]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rows.length > pageSize && (
        <TablePagination
          component="div"
          count={rows.length}
          page={page}
          onPageChange={(_e, next) => setPage(next)}
          rowsPerPage={pageSize}
          rowsPerPageOptions={[pageSize]}
        />
      )}
    </TableContainer>
  );
}
