/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable testing-library/no-unnecessary-act */ // @TODO remove and fix test
import "jest-extended";

import { Contracts, ReadOnlyWallet } from "@ardenthq/sdk-profiles";
import userEvent from "@testing-library/user-event";
import nock from "nock";
import React from "react";
import { Route } from "react-router-dom";

import { SendVote } from "./SendVote";
import { LedgerProvider } from "@/app/contexts";
import { VoteDelegateProperties } from "@/domains/vote/components/DelegateTable/DelegateTable.contracts";
import { appendParameters } from "@/domains/vote/utils/url-parameters";
import { data as delegateData } from "@/tests/fixtures/coins/ark/devnet/delegates.json";
import unvoteFixture from "@/tests/fixtures/coins/ark/devnet/transactions/unvote.json";
import voteFixture from "@/tests/fixtures/coins/ark/devnet/transactions/vote.json";
import {
	act,
	env,
	getDefaultProfileId,
	getDefaultWalletMnemonic,
	render,
	screen,
	syncDelegates,
	syncFees,
	waitFor,
	mockProfileWithPublicAndTestNetworks,
} from "@/utils/testing-library";

const fixtureProfileId = getDefaultProfileId();

const createVoteTransactionMock = (wallet: Contracts.IReadWriteWallet) =>
	// @ts-ignore
	jest.spyOn(wallet.transaction(), "transaction").mockReturnValue({
		amount: () => voteFixture.data.amount / 1e8,
		data: () => ({ data: () => voteFixture.data }),
		explorerLink: () => `https://test.arkscan.io/transaction/${voteFixture.data.id}`,
		fee: () => voteFixture.data.fee / 1e8,
		id: () => voteFixture.data.id,
		isMultiSignatureRegistration: () => false,
		recipient: () => voteFixture.data.recipient,
		sender: () => voteFixture.data.sender,
		type: () => "vote",
		usesMultiSignature: () => false,
	});

const passphrase = getDefaultWalletMnemonic();
let profile: Contracts.IProfile;
let wallet: Contracts.IReadWriteWallet;

const votingMockImplementation = () => [
	{
		amount: 10,
		wallet: new ReadOnlyWallet({
			address: delegateData[1].address,
			explorerLink: "",
			governanceIdentifier: "address",
			isDelegate: true,
			isResignedDelegate: false,
			publicKey: delegateData[1].publicKey,
			username: delegateData[1].username,
		}),
	},
];

const continueButton = () => screen.getByTestId("StepNavigation__continue-button");
const sendButton = () => screen.getByTestId("StepNavigation__send-button");

const reviewStepID = "SendVote__review-step";
const formStepID = "SendVote__form-step";

describe("SendVote Combined", () => {
	let resetProfileNetworksMock: () => void;

	beforeAll(async () => {
		profile = env.profiles().findById(getDefaultProfileId());

		await env.profiles().restore(profile);
		await profile.sync();

		wallet = profile.wallets().findById("ac38fe6d-4b67-4ef1-85be-17c5f6841129");
		await wallet.synchroniser().identity();

		jest.spyOn(wallet, "isDelegate").mockImplementation(() => true);

		await syncDelegates(profile);
		await syncFees(profile);

		for (const index of [0, 1]) {
			/* eslint-disable-next-line testing-library/prefer-explicit-assert */
			env.delegates().findByAddress(wallet.coinId(), wallet.networkId(), delegateData[index].address);
		}

		nock.disableNetConnect();

		nock("https://ark-test.arkvault.io")
			.get("/api/transactions/d819c5199e323a62a4349948ff075edde91e509028329f66ec76b8518ad1e493")
			.reply(200, voteFixture)
			.get("/api/transactions/32e5278cb72f24f2c04c4797dbfbffa7072f6a30e016093fdd3f7660a2ee2faf")
			.reply(200, unvoteFixture)
			.persist();
	});

	beforeEach(() => {
		jest.useFakeTimers("legacy");
		resetProfileNetworksMock = mockProfileWithPublicAndTestNetworks(profile);
	});

	afterEach(() => {
		jest.useRealTimers();
		resetProfileNetworksMock();
	});

	it("should send a unvote & vote transaction", async () => {
		const votesMock = jest.spyOn(wallet.voting(), "current").mockImplementation(votingMockImplementation);
		await wallet.synchroniser().votes();

		const voteURL = `/profiles/${fixtureProfileId}/wallets/${wallet.id()}/send-vote`;

		const parameters = new URLSearchParams(`?walletId=${wallet.id()}&nethash=${wallet.network().meta().nethash}`);

		const unvotes: VoteDelegateProperties[] = [
			{
				amount: 10,
				delegateAddress: delegateData[1].address,
			},
		];

		appendParameters(parameters, "unvote", unvotes);

		const votes: VoteDelegateProperties[] = [
			{
				amount: 10,
				delegateAddress: delegateData[0].address,
			},
		];

		appendParameters(parameters, "vote", votes);

		const { history } = render(
			<Route path="/profiles/:profileId/wallets/:walletId/send-vote">
				<LedgerProvider>
					<SendVote />
				</LedgerProvider>
			</Route>,
			{
				route: {
					pathname: voteURL,
					search: `?${parameters}`,
				},
			},
		);

		expect(screen.getByTestId(formStepID)).toBeInTheDocument();

		await waitFor(() => expect(screen.getByTestId(formStepID)).toHaveTextContent(delegateData[0].username));

		expect(screen.getAllByRole("radio")[1]).toBeChecked();

		await waitFor(() => expect(continueButton()).not.toBeDisabled());
		userEvent.click(continueButton());

		// Review Step
		expect(screen.getByTestId(reviewStepID)).toBeInTheDocument();

		userEvent.click(continueButton());

		// AuthenticationStep
		expect(screen.getByTestId("AuthenticationStep")).toBeInTheDocument();

		const signUnvoteMock = jest
			.spyOn(wallet.transaction(), "signVote")
			.mockReturnValue(Promise.resolve(unvoteFixture.data.id));
		const broadcastUnvoteMock = jest.spyOn(wallet.transaction(), "broadcast").mockResolvedValue({
			accepted: [unvoteFixture.data.id],
			errors: {},
			rejected: [],
		});
		const transactionUnvoteMock = createVoteTransactionMock(wallet);

		const signVoteMock = jest
			.spyOn(wallet.transaction(), "signVote")
			.mockReturnValue(Promise.resolve(voteFixture.data.id));
		const broadcastVoteMock = jest.spyOn(wallet.transaction(), "broadcast").mockResolvedValue({
			accepted: [voteFixture.data.id],
			errors: {},
			rejected: [],
		});
		const transactionVoteMock = createVoteTransactionMock(wallet);

		const passwordInput = screen.getByTestId("AuthenticationStep__mnemonic");
		userEvent.paste(passwordInput, passphrase);

		expect(passwordInput).toHaveValue(passphrase);

		await waitFor(() => expect(sendButton()).not.toBeDisabled());

		await act(async () => {
			userEvent.click(sendButton());
		});

		act(() => {
			jest.advanceTimersByTime(1000);
		});

		setTimeout(() => {
			votesMock.mockRestore();
		}, 3000);

		act(() => {
			jest.runOnlyPendingTimers();
		});

		await expect(screen.findByTestId("TransactionSuccessful")).resolves.toBeVisible();

		await waitFor(() => expect(setInterval).toHaveBeenCalledTimes(1));

		const historySpy = jest.spyOn(history, "push");

		// Go back to wallet
		userEvent.click(screen.getByTestId("StepNavigation__back-to-wallet-button"));

		expect(historySpy).toHaveBeenCalledWith(`/profiles/${profile.id()}/wallets/${wallet.id()}`);

		historySpy.mockRestore();

		signUnvoteMock.mockRestore();
		broadcastUnvoteMock.mockRestore();
		transactionUnvoteMock.mockRestore();

		signVoteMock.mockRestore();
		broadcastVoteMock.mockRestore();
		transactionVoteMock.mockRestore();
	});
});
