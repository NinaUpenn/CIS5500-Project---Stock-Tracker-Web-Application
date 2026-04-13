// LazyTable — a small, declarative table built on MUI that handles:
//   * column definitions with custom render fns,
//   * client-side pagination,
//   * row `key` from an opinionated accessor,
//   * empty-state fallback.
//
// Kept intentionally minimal; we add features (sorting, server-side
// paging) only when a concrete page needs them.

import { useState, useMemo } from 'react';
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TablePagination,
  Typography,
  Paper,
  TableContainer,
} from '@mui/material';

/**
 * columns: [{ field, header, render?, align? }]
 * rows:    array of objects (must have a unique `keyField` value)
 */
export default function LazyTable({
  columns,
  rows,
  keyField = 'ticker',
  pageSize = 10,
  emptyMessage = 'No rows.',
}) {
  const [page, setPage] = useState(0);

  const paged = useMemo(() => {
    const start = page * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page, pageSize]);

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
            {columns.map((col) => (
              <TableCell key={col.field} align={col.align || 'left'}>
                <strong>{col.header}</strong>
              </TableCell>
            ))}
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
