// mui table wrapper. client-side pagination + empty state.
// columns: [{ field, header, render?, align? }]
// rows need a unique `keyField` value each

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
