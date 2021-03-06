/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { IPager, PagedModel } from 'vs/base/common/paging';
import { TPromise } from 'vs/base/common/winjs.base';
import { CancellationToken, CancellationTokenSource } from 'vs/base/common/cancellation';
import { isPromiseCanceledError, canceled } from 'vs/base/common/errors';

function getPage(pageIndex: number, cancellationToken: CancellationToken): Thenable<number[]> {
	if (cancellationToken.isCancellationRequested) {
		return TPromise.wrapError(canceled());
	}

	return TPromise.as([0, 1, 2, 3, 4].map(i => i + (pageIndex * 5)));
}

class TestPager implements IPager<number> {

	readonly firstPage = [0, 1, 2, 3, 4];
	readonly pageSize = 5;
	readonly total = 100;
	readonly getPage: (pageIndex: number, cancellationToken: CancellationToken) => Thenable<number[]>;

	constructor(getPageFn?: (pageIndex: number, cancellationToken: CancellationToken) => Thenable<number[]>) {
		this.getPage = getPageFn || getPage;
	}
}

suite('PagedModel', () => {

	test('isResolved', () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(model.isResolved(0));
		assert(model.isResolved(1));
		assert(model.isResolved(2));
		assert(model.isResolved(3));
		assert(model.isResolved(4));
		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));
		assert(!model.isResolved(99));
	});

	test('resolve single', () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(!model.isResolved(5));

		return model.resolve(5, CancellationToken.None).then(() => {
			assert(model.isResolved(5));
		});
	});

	test('resolve page', () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));

		return model.resolve(5, CancellationToken.None).then(() => {
			assert(model.isResolved(5));
			assert(model.isResolved(6));
			assert(model.isResolved(7));
			assert(model.isResolved(8));
			assert(model.isResolved(9));
			assert(!model.isResolved(10));
		});
	});

	test('resolve page 2', () => {
		const pager = new TestPager();
		const model = new PagedModel(pager);

		assert(!model.isResolved(5));
		assert(!model.isResolved(6));
		assert(!model.isResolved(7));
		assert(!model.isResolved(8));
		assert(!model.isResolved(9));
		assert(!model.isResolved(10));

		return model.resolve(10, CancellationToken.None).then(() => {
			assert(!model.isResolved(5));
			assert(!model.isResolved(6));
			assert(!model.isResolved(7));
			assert(!model.isResolved(8));
			assert(!model.isResolved(9));
			assert(model.isResolved(10));
		});
	});

	test('preemptive cancellation works', function () {
		const pager = new TestPager(() => {
			assert(false);
			return TPromise.wrap([]);
		});

		const model = new PagedModel(pager);

		return model.resolve(5, CancellationToken.Cancelled).then(
			() => assert(false),
			err => assert(isPromiseCanceledError(err))
		);
	});

	test('cancellation works', function () {
		const pager = new TestPager((_, token) => new TPromise((_, e) => {
			token.onCancellationRequested(() => e(canceled()));
		}));

		const model = new PagedModel(pager);
		const tokenSource = new CancellationTokenSource();

		const promise = model.resolve(5, tokenSource.token).then(
			() => assert(false),
			err => assert(isPromiseCanceledError(err))
		);

		setTimeout(() => tokenSource.cancel(), 10);

		return promise;
	});

	test('same page cancellation works', function () {
		let state = 'idle';

		const pager = new TestPager((pageIndex, token) => {
			state = 'resolving';

			return new TPromise((_, e) => {
				token.onCancellationRequested(() => {
					state = 'idle';
					e(canceled());
				});
			});
		});

		const model = new PagedModel(pager);

		assert.equal(state, 'idle');

		const tokenSource1 = new CancellationTokenSource();
		const promise1 = model.resolve(5, tokenSource1.token).then(
			() => assert(false),
			err => assert(isPromiseCanceledError(err))
		);

		assert.equal(state, 'resolving');

		const tokenSource2 = new CancellationTokenSource();
		const promise2 = model.resolve(6, tokenSource2.token).then(
			() => assert(false),
			err => assert(isPromiseCanceledError(err))
		);

		assert.equal(state, 'resolving');

		setTimeout(() => {
			assert.equal(state, 'resolving');
			tokenSource1.cancel();
			assert.equal(state, 'resolving');

			setTimeout(() => {
				assert.equal(state, 'resolving');
				tokenSource2.cancel();
				assert.equal(state, 'idle');
			}, 10);
		}, 10);

		return TPromise.join([promise1, promise2]);
	});
});